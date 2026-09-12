let currentUser = null;
let globalCustomers = {};
let globalLocations = {};
let globalUnits = {};

// ==========================================
// --- CUSTOMER DASHBOARD LOGIC ---
// ==========================================

let customerLocations = {};
let customerUnits = {};
let currentMonitorUnitId = null;

function loadCustomerDashboard(userData) {
    currentUser = userData;
    document.getElementById('login-screen').classList.remove('active');
    document.getElementById('customer-screen').classList.add('active');
    
    // 🔴 අලුත්: දකුණු පැත්තේ උඩින් Customer ගේ නම සහ Email එක පෙන්වීම
    const topNameEl = document.getElementById('top-user-name');
    const topEmailEl = document.getElementById('top-user-email');
    if (topNameEl) topNameEl.innerText = userData.name || "Customer";
    if (topEmailEl) topEmailEl.innerText = userData.email || "No email provided";

    // Listen to this customer's data
    listenToCustomerData(userData.uid);
    initCustomerChat();
    initRealtimeListeners(currentMonitorUnitId);
    renderCustomerOverview();
}

function listenToCustomerData(uid) {
    // 1. Fetch Locations owned by this customer
    window.dbOnValue(window.dbRef(window.firebaseDB, 'locations'), (snapshot) => {
        const allLocs = snapshot.val() || {};
        customerLocations = {};
        for(const [locId, loc] of Object.entries(allLocs)) {
            if(loc.customerId === uid) {
                customerLocations[locId] = loc;
            }
        }
        fetchCustomerUnits();
    });
}

function fetchCustomerUnits() {
    // 2. Fetch Units assigned to those locations
    window.dbOnValue(window.dbRef(window.firebaseDB, 'units'), (snapshot) => {
        const allUnits = snapshot.val() || {};
        customerUnits = {};
        for(const [unitId, unit] of Object.entries(allUnits)) {
            if(customerLocations[unit.locationId]) {
                customerUnits[unitId] = unit;
            }
        }
        renderCustomerUnits();
    });
}

function renderCustomerUnits() {

}

function switchCustomerTab(tabId) {
    // 1. සියලුම ටැබ් සඟවන්න
    document.querySelectorAll('#customer-screen .admin-tab').forEach(tab => {
        tab.classList.remove('active');
        tab.style.display = 'none'; // <-- අලුතින් එකතු කළ කොටස
    });
    
    // 2. මෙනුවේ සියලුම ලින්ක් වල active තත්ත්වය ඉවත් කරන්න
    document.querySelectorAll('#customer-screen .nav-links li').forEach(li => {
        li.classList.remove('active');
    });
    
    // 3. තෝරාගත් ටැබ් එක පමණක් පෙන්වන්න
    const selectedTab = document.getElementById(tabId);
    if (selectedTab) {
        selectedTab.classList.add('active');
        selectedTab.style.display = 'block'; // <-- සුදු තිරේ ප්‍රශ්නය විසඳන පේළිය
    }
    
    // 4. මෙනුවේ අදාළ ලින්ක් එක active කරන්න
    const selectedNav = document.getElementById('tab-' + tabId);
    if (selectedNav) {
        selectedNav.classList.add('active');
    }
}

let liveChart = null; // ප්‍රස්ථාරය රඳවා තබාගන්නා විචල්‍යය

function initLiveChart() {
    const container = document.getElementById('chart-container');
    container.innerHTML = '<canvas id="live-data-chart"></canvas>';
    const ctx = document.getElementById('live-data-chart').getContext('2d');

    if (liveChart) {
        liveChart.destroy(); // වෙනත් Unit එකකට මාරු වුවහොත් පරණ ප්‍රස්ථාරය මකා දමයි
    }

    liveChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [], // කාලය (Timestamps)
            datasets: [
                { label: 'CH4 (ppm)', data: [], borderColor: '#16A34A', tension: 0.4, borderWidth: 2, pointRadius: 0 },
                { label: 'CO2 (ppm)', data: [], borderColor: '#F59E0B', tension: 0.4, borderWidth: 2, pointRadius: 0 }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: { display: true },
                y: { display: true, beginAtZero: true }
            },
            animation: false // සජීවීව දත්ත එන විට ගැස්සීම් වළක්වා ගැනීමට animation off කර ඇත
        }
    });
}

function openLiveMonitor(unitId, title, address) {
    currentMonitorUnitId = unitId;
    document.getElementById('customer-units-container').style.display = 'none';
    document.getElementById('live-monitor-container').style.display = 'block';
    
    document.getElementById('live-unit-name').innerText = title;
    document.getElementById('live-unit-location').innerText = address;
    document.getElementById('btn-back-units').style.display = 'block';

    // තිරය විවෘත වන විටම ප්‍රස්ථාරය ආරම්භ කරන්න
    initLiveChart();
}

document.getElementById('btn-back-units')?.addEventListener('click', () => {
    currentMonitorUnitId = null;
    document.getElementById('live-monitor-container').style.display = 'none';
    document.getElementById('customer-units-container').style.display = 'block';
    document.getElementById('btn-back-units').style.display = 'none';
});

document.getElementById('customer-logout-btn')?.addEventListener('click', () => {
    if (window.firebaseAuth) {
        window.firebaseAuth.signOut().then(() => {
            document.getElementById('customer-screen').classList.remove('active');
            document.getElementById('login-screen').classList.add('active');
            currentUser = null;
            currentMonitorUnitId = null;
        }).catch(err => console.error(err));
    }
});

// ==========================================
// --- LIVE DATA HANDLING (SOCKET.IO) ---
// ==========================================

// Connect to backend Socket (Make sure server.js is running)
const socket = io('https://biogas-system-jh34.onrender.com'); 

socket.on('liveData', (data) => {
    // 1. Customer Monitor එකේ අගයන් සජීවීව වෙනස් කිරීම
    if (currentMonitorUnitId && data.unitId === currentMonitorUnitId) {
        updateLiveUI(data);
    }
    
    // 2. 🔴 Admin ලොග් වී සිටී නම්, Refresh නොකරම Alerts සජීවීව පරීක්ෂා කිරීම 🔴
    if (currentUser && currentUser.role === 'admin') {
        // Overview ටැබ් එකේ සිටී නම් පමණක් Alert එක අප්ඩේට් කරයි
        if (document.getElementById('admin-overview').classList.contains('active')) {
            checkSystemAlerts();
        }
    }
});

function updateLiveUI(data) {
    document.getElementById('val-ch4').innerText = data.ch4 != null ? data.ch4.toFixed(2) : '0.00';
    document.getElementById('val-co2').innerText = data.co2 != null ? data.co2.toFixed(2) : '0.00';
    document.getElementById('val-h2s').innerText = data.h2s != null ? data.h2s.toFixed(2) : '0.00';
    document.getElementById('val-ph').innerText = data.ph != null ? data.ph.toFixed(2) : '0.0';
    document.getElementById('val-pressure').innerText = data.pressure != null ? data.pressure.toFixed(2) : '0.0';
    document.getElementById('val-temp').innerText = data.temperature != null ? data.temperature.toFixed(1) : '0.0';
    document.getElementById('val-hum').innerText = data.humidity != null ? data.humidity.toFixed(1) : '0.0';
// 'gasVolume' සහ 'volume' යන නම් දෙකම හඳුනාගැනීම
    const volumeValue = data.gasVolume != null ? data.gasVolume : (data.volume != null ? data.volume : 0);
    document.getElementById('val-vol').innerText = volumeValue.toFixed(2);    // Update Valve & Pump Status
    const vStatus = document.getElementById('status-valve');
    if (data.valve3 === 'ON') {
        vStatus.innerText = 'ON';
        vStatus.classList.add('on');
    } else {
        vStatus.innerText = 'OFF';
        vStatus.classList.remove('on');
    }

    const pStatus = document.getElementById('status-pump');
    if (data.pump === 'ON') {
        pStatus.innerText = 'ON';
        pStatus.classList.add('on');
    } else {
        pStatus.innerText = 'OFF';
        pStatus.classList.remove('on');
    }

    // Update 3D Tank Level
    // Assuming maximum tank distance to sensor is 300cm (Empty) and 0cm is Full
    if (data.distance != null) {
        document.getElementById('val-distance').innerText = data.distance.toFixed(1);
        
        const maxDepth = 300; 
        let fillPercent = ((maxDepth - data.distance) / maxDepth) * 100;
        
        if (fillPercent > 100) fillPercent = 100;
        if (fillPercent < 0) fillPercent = 0;
        
        document.getElementById('tank-level-fill').style.height = `${fillPercent}%`;
    }

    // Update Chart with Real-time Data
    if (liveChart) {
        const timeNow = new Date().toLocaleTimeString();
        
        liveChart.data.labels.push(timeNow);
        liveChart.data.datasets[0].data.push(data.ch4 || 0);
        liveChart.data.datasets[1].data.push(data.co2 || 0);
        
        // ප්‍රස්ථාරයේ එකවර පෙන්වන්නේ අවසන් දත්ත ලක්ෂ්‍ය (data points) 20 පමණි
        if (liveChart.data.labels.length > 20) {
            liveChart.data.labels.shift();
            liveChart.data.datasets[0].data.shift();
            liveChart.data.datasets[1].data.shift();
        }
        
        liveChart.update();
    }
}

function loadAdminDashboard(userData) {
    currentUser = userData;
    document.getElementById('login-screen').classList.remove('active');
    document.getElementById('admin-screen').classList.add('active');
    
    document.getElementById('admin-welcome-msg').innerText = `Welcome, ${userData.name}`;
    
    startDashboardLiveUpdates();
    listenToAdminData();
    initAdminChat();
    initRealtimeListeners();
}

function listenToAdminData() {
    window.dbOnValue(window.dbRef(window.firebaseDB, 'users'), (snapshot) => {
        globalCustomers = {};
        const users = snapshot.val() || {};
        const customerSelect = document.getElementById('customer-select');
        
        if(customerSelect) {
            const currentValue = customerSelect.value;
            customerSelect.innerHTML = '<option value="new">+ Create New Customer</option>';
            for (const [uid, user] of Object.entries(users)) {
                if (user.role === 'customer') {
                    globalCustomers[uid] = user;
                    const opt = document.createElement('option');
                    opt.value = uid;
                    opt.textContent = `${user.name} (${user.phone})`;
                    customerSelect.appendChild(opt);
                }
            }
            if(globalCustomers[currentValue]) {
                customerSelect.value = currentValue;
            }
        }
        updateDeploymentsUI();
    });

    window.dbOnValue(window.dbRef(window.firebaseDB, 'locations'), (snapshot) => {
        globalLocations = snapshot.val() || {};
        handleCustomerSelection();
        updateDeploymentsUI();
    });

    window.dbOnValue(window.dbRef(window.firebaseDB, 'units'), (snapshot) => {
        globalUnits = snapshot.val() || {};
        
        // 🔴 FIX: පරණ ID එක තියෙනවද කියලා බලලා විතරක් Update කිරීම (Crash වීම වළක්වයි)
        const totalUnitsEl = document.getElementById('admin-total-units');
        if (totalUnitsEl) {
            totalUnitsEl.innerText = Object.keys(globalUnits).length;
        }
        
        updateDeploymentsUI(); // දැන් මේක කිසිම Error එකක් නැතුව වැඩ කරනවා
        
        checkSystemAlerts(); 
    });
}

function checkSystemAlerts() {
    const grid = document.getElementById('attention-units-grid');
    if (!grid) return;
    
    let alertCount = 0;
    let alertsHtml = '';
    
    const unitKeys = Object.keys(globalUnits);
    if (unitKeys.length === 0) {
        grid.innerHTML = '<p class="text-muted" style="grid-column: 1/-1;">No units deployed yet.</p>';
        return;
    }

    let processedCount = 0;

    unitKeys.forEach(unitId => {
        window.dbGet(window.dbRef(window.firebaseDB, `sensor_logs/${unitId}`)).then(snapshot => {
            processedCount++;
            if (snapshot.exists()) {
                const logs = snapshot.val();
                const logIds = Object.keys(logs);
                const latestData = logs[logIds[logIds.length - 1]]; 
                
                let issues = [];
                
                if (latestData.pressure > 1.3) issues.push(`High Pressure (${latestData.pressure} bar)`);
                if (latestData.h2s > 1.8) issues.push(`High H2S (${latestData.h2s} ppm)`);
                if (latestData.temperature > 40) issues.push(`High Temp (${latestData.temperature}°C)`);
                if (latestData.ph < 6.0 || latestData.ph > 8.0) issues.push(`pH Imbalance (${latestData.ph})`);

                if (issues.length > 0) {
                    alertCount++;
                    const unit = globalUnits[unitId] || {};
                    const loc = globalLocations[unit.locationId] || {};
                    const cust = globalCustomers[loc.customerId] || {};
                    
                    const title = loc.locationName || 'Unknown Location';
                    const address = loc.address || 'No address provided';
                    const custName = cust.name || 'Unknown Customer';
                    const custPhone = cust.phone || 'N/A';
                    
                    alertsHtml += `
                        <div class="param-card" style="border: 1px solid #FCA5A5; background-color: #FEF2F2; text-align: left;">
                            <h4 style="color: #991B1B; margin-bottom: 8px; font-size: 16px;">🚨 ${title}</h4>
                            <p style="font-size: 13px; color: #7F1D1D; margin-bottom: 4px;"><strong>Customer:</strong> ${custName} | 📞 ${custPhone}</p>
                            <p style="font-size: 13px; color: #7F1D1D; margin-bottom: 12px;"><strong>Address:</strong> ${address}</p>
                            <p style="font-size: 13px; color: #991B1B; margin-bottom: 12px; background: #FEE2E2; padding: 6px; border-radius: 6px;"><strong>Issues:</strong> ${issues.join(', ')}</p>
                            <p style="font-size: 12px; color: #9CA3AF; margin: 0;">Last check: ${new Date(latestData.timestamp).toLocaleTimeString()}</p>
                        </div>
                    `;
                }
            }
            
            if (processedCount === unitKeys.length) {
                if (alertCount === 0) {
                    grid.innerHTML = `
                        <div style="grid-column: 1/-1; background: #DCFCE7; padding: 20px; border-radius: 12px; border: 1px solid #86EFAC; display: flex; align-items: center; gap: 12px;">
                            <span style="font-size: 24px;">✅</span>
                            <div>
                                <h4 style="color: #166534; margin: 0; font-size: 16px;">All Systems Operational</h4>
                                <p style="color: #15803D; margin: 4px 0 0 0; font-size: 14px;">No critical alerts detected across all biogas units.</p>
                            </div>
                        </div>
                    `;
                } else {
                    grid.innerHTML = alertsHtml;
                }
            }
        }).catch(err => {
            console.error("Alert Check Error:", err);
            processedCount++;
        });
    });
}

function updateDeploymentsUI(searchQuery = '') {
    const listContainer = document.getElementById('all-units-list');
    if(!listContainer) return;
    
    listContainer.innerHTML = ''; 
    
    const unitKeys = Object.keys(globalUnits);
    if(unitKeys.length === 0) {
        listContainer.innerHTML = '<p class="text-muted" style="padding: 20px 0;">No deployments found. Add a new unit to get started.</p>';
        return;
    }

    const unitsByLocation = {};
    for (const unit of Object.values(globalUnits)) {
        unitsByLocation[unit.locationId] = (unitsByLocation[unit.locationId] || 0) + 1;
    }

    for (const [unitId, unit] of Object.entries(globalUnits)) {
        const loc = globalLocations[unit.locationId] || {};
        const cust = globalCustomers[loc.customerId] || {};
        
        const locUnitCount = unitsByLocation[unit.locationId] || 1;
        let displayTitle = loc.locationName || 'Unknown Location';
        
        if (locUnitCount > 1 && unit.unitName) {
            displayTitle = `${loc.locationName} - ${unit.unitName}`;
        }

        const searchString = `${displayTitle} ${cust.name} ${loc.locationName} ${unit.unitToken} ${unitId}`.toLowerCase();
        if (searchQuery && !searchString.includes(searchQuery.toLowerCase())) {
            continue; 
        }
        
        const card = document.createElement('div');
        card.className = 'deployment-card';
        const isAccessOn = cust.accessGranted !== false; 
        const toggleBg = isAccessOn ? '#10B981' : '#E5E7EB';
        const toggleDot = isAccessOn ? 'calc(100% - 18px)' : '2px';
        const unreadChat = cust.unreadMessages || 0; 
        const activeAlerts = unit.activeAlerts || 0; 

        // 🔴 අලුත්: දත්ත නැතිනම් 'undefined' වෙනුවට 'N/A' ලබා දීම
        const safeEmail = cust.email || 'N/A';
        const safePass = cust.rawPass || 'N/A';
        const safeLoginLink = cust.loginLink || 'N/A';
        const safeName = cust.name || 'Unknown';
        const safePhone = cust.phone || 'N/A';

        card.innerHTML = `
            <div class="dep-info" style="padding: 24px; background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 12px; box-shadow: 0 2px 4px rgba(0,0,0,0.02);">
                 
                 <!-- Header Section -->
                 <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px;">
                     <div style="display: flex; align-items: center; gap: 12px;">
                         <h4 style="margin: 0; font-size: 18px; color: #0F172A; font-weight: 700;">${displayTitle}</h4>
                         <span class="badge ${unit.status || 'active'}">${unit.status || 'ACTIVE'}</span>
                         
                         ${activeAlerts > 0 ? 
                            `<span style="background: #FEF2F2; color: #DC2626; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; border: 1px solid #FCA5A5; display: flex; align-items: center; gap: 6px;" onclick="switchScreen('complaints-screen')">⚠️ ${activeAlerts} Critical Alerts</span>` 
                            : 
                            `<span style="background: #F0FDF4; color: #16A34A; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600; border: 1px solid #BBF7D0;">✅ System Stable</span>`
                         }
                     </div>
                     
                     <div style="display: flex; align-items: center; gap: 8px; cursor: pointer;" onclick="toggleCustomerAccess('${loc.customerId}', ${isAccessOn})">
                         <span style="font-size: 12px; font-weight: 700; color: ${isAccessOn ? '#10B981' : '#9CA3AF'};">${isAccessOn ? 'ACCESS ON' : 'ACCESS OFF'}</span>
                         <div style="width: 36px; height: 20px; background: ${toggleBg}; border-radius: 20px; position: relative; transition: 0.3s;">
                             <div style="width: 16px; height: 16px; background: #FFF; border-radius: 50%; position: absolute; top: 2px; left: ${toggleDot}; transition: 0.3s; box-shadow: 0 1px 3px rgba(0,0,0,0.2);"></div>
                         </div>
                     </div>
                 </div>

                 <!-- Customer Details -->
                 <div style="display: flex; flex-wrap: wrap; gap: 16px; font-size: 13px; color: #64748B; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 1px solid #F1F5F9;">
                     <span><strong style="color: #475569;">Customer:</strong> ${safeName}</span>
                     <span style="color: #CBD5E1;">|</span>
                     <span><strong style="color: #475569;">Phone:</strong> ${safePhone}</span>
                     <span style="color: #CBD5E1;">|</span>
                     <span><strong style="color: #475569;">Unit ID:</strong> <span style="font-family: monospace; color: #0F172A;">${unitId}</span></span>
                 </div>
                 
                 <!-- Credentials Section -->
                 <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px;">
                     
                     <!-- Box 1: Username -->
                     <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; border: 1px solid #E2E8F0; border-radius: 8px; background: #F8FAFC;">
                         <div>
                             <div style="font-size: 11px; font-weight: 600; color: #64748B; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;">Username</div>
                             <div style="font-size: 14px; font-weight: 600; color: #0F172A;">${safeEmail}</div>
                         </div>
                         <button onclick="copyText('${safeEmail}')" style="padding: 6px 12px; font-size: 12px; font-weight: 600; color: #475569; background: #FFFFFF; border: 1px solid #CBD5E1; border-radius: 6px; cursor: pointer; transition: 0.2s;">Copy</button>
                     </div>

                     <!-- Box 2: Password -->
                     <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; border: 1px solid #E2E8F0; border-radius: 8px; background: #F8FAFC;">
                         <div>
                             <div style="font-size: 11px; font-weight: 600; color: #64748B; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;">Password</div>
                             <div style="font-size: 14px; font-weight: 600; color: #0F172A;">${safePass}</div>
                         </div>
                         <button onclick="copyText('${safePass}')" style="padding: 6px 12px; font-size: 12px; font-weight: 600; color: #475569; background: #FFFFFF; border: 1px solid #CBD5E1; border-radius: 6px; cursor: pointer; transition: 0.2s;">Copy</button>
                     </div>

                     <!-- Box 3: Login Link -->
                     <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; border: 1px solid #E2E8F0; border-radius: 8px; background: #F8FAFC;">
                         <div>
                             <div style="font-size: 11px; font-weight: 600; color: #64748B; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;">Login Link</div>
                             <div style="font-size: 14px; color: #64748B;">Secure URL</div>
                         </div>
                         <button onclick="copyText('${safeLoginLink}')" style="padding: 6px 12px; font-size: 12px; font-weight: 600; color: #475569; background: #FFFFFF; border: 1px solid #CBD5E1; border-radius: 6px; cursor: pointer; transition: 0.2s;">Copy Link</button>
                     </div>

                     <!-- Box 4: Device Endpoint -->
                     <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; border: 1px solid #E2E8F0; border-radius: 8px; background: #F8FAFC;">
                         <div>
                             <div style="font-size: 11px; font-weight: 600; color: #64748B; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;">Device Endpoint</div>
                             <div style="font-size: 14px; color: #64748B;">API Token</div>
                         </div>
                         <button onclick="copyText('${unit.unitToken}')" style="padding: 6px 12px; font-size: 12px; font-weight: 600; color: #475569; background: #FFFFFF; border: 1px solid #CBD5E1; border-radius: 6px; cursor: pointer; transition: 0.2s;">Copy API</button>
                     </div>
                 </div>

                 <!-- Action Buttons Row -->
                 <div style="display: flex; gap: 10px; justify-content: flex-end; flex-wrap: wrap;">
                     <button onclick="viewUnitAsAdmin('${unitId}')" style="padding: 8px 16px; font-size: 13px; background: #FFFFFF; color: #0F172A; border: 1px solid #CBD5E1; border-radius: 6px; font-weight: 600; cursor: pointer; margin-right: auto; transition: 0.2s;">View Dashboard</button>
                     
                     <button onclick="switchAdminTab('admin-complaints'); setTimeout(() => openAdminChat('${unitId}', {name:'${safeName}', phone:'${safePhone}'}, '${displayTitle}'), 100);" style="padding: 8px 16px; font-size: 13px; background: #FFFFFF; color: #1D4ED8; border: 1px solid #BFDBFE; border-radius: 6px; font-weight: 600; cursor: pointer; position: relative; transition: 0.2s;">
                         Customer Chat
                         ${unreadChat > 0 ? `<span style="position: absolute; top: -6px; right: -6px; background: #EF4444; color: white; border-radius: 50%; width: 18px; height: 18px; font-size: 10px; display: flex; align-items: center; justify-content: center; font-weight: bold; border: 2px solid #FFF; box-shadow: 0 1px 2px rgba(0,0,0,0.1);">${unreadChat}</span>` : ''}
                     </button>

                     <button onclick="shareCustomerDetails('${safeName}', '${safeEmail}', '${safePass}', '${safeLoginLink}', '${unit.unitToken}')" style="padding: 8px 16px; font-size: 13px; background: #0F172A; color: #FFFFFF; border: 1px solid #0F172A; border-radius: 6px; font-weight: 600; cursor: pointer; transition: 0.2s;">Share Details</button>
                     
                     <button onclick="deleteUnit('${unitId}', '${displayTitle}')" style="padding: 8px 16px; font-size: 13px; background: #FFFFFF; color: #DC2626; border: 1px solid #FECACA; border-radius: 6px; font-weight: 600; cursor: pointer; transition: 0.2s;">Delete</button>
                 </div>
             </div>
         `;
        listContainer.appendChild(card);
    }
}

// --- ADVANCED SEARCH & SUGGESTIONS LOGIC ---
const searchInput = document.getElementById('admin-search-input');
const suggestionsBox = document.getElementById('search-suggestions');

searchInput?.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase().trim();
    
    // Update the main list in the background
    updateDeploymentsUI(query);

    if (query.length === 0) {
        if(suggestionsBox) suggestionsBox.style.display = 'none';
        return;
    }

    if(!suggestionsBox) return;
    suggestionsBox.innerHTML = '';
    let matchCount = 0;

    const unitsByLocation = {};
    for (const unit of Object.values(globalUnits)) {
        unitsByLocation[unit.locationId] = (unitsByLocation[unit.locationId] || 0) + 1;
    }

    for (const [unitId, unit] of Object.entries(globalUnits)) {
        const loc = globalLocations[unit.locationId] || {};
        const cust = globalCustomers[loc.customerId] || {};
        
        const locUnitCount = unitsByLocation[unit.locationId] || 1;
        let displayTitle = loc.locationName || 'Unknown Location';
        
        if (locUnitCount > 1 && unit.unitName) {
            displayTitle = `${loc.locationName} - ${unit.unitName}`;
        }

        const searchString = `${displayTitle} ${cust.name} ${loc.locationName} ${unit.hardwareMac} ${unitId}`.toLowerCase();
        
        if (searchString.includes(query)) {
            matchCount++;
            const div = document.createElement('div');
            div.className = 'suggestion-item';
            div.innerHTML = `
                <h5>${displayTitle}</h5>
                <p>${cust.name || 'Unknown'} | Token: <span class="mac-text">${unit.unitToken || 'N/A'}</span></p>
            `;
            
            // Handle clicking on a suggestion
            div.onclick = () => {
                searchInput.value = displayTitle; 
                suggestionsBox.style.display = 'none';
                switchAdminTab('admin-deployments'); 
                updateDeploymentsUI(displayTitle); 
            };
            
            suggestionsBox.appendChild(div);
        }
    }

    if (matchCount > 0) {
        suggestionsBox.style.display = 'block';
    } else {
        suggestionsBox.innerHTML = '<div class="suggestion-item"><p>No matching units found</p></div>';
        suggestionsBox.style.display = 'block';
    }
});

// Hide suggestions when clicking anywhere outside the search box
document.addEventListener('click', (e) => {
    if (searchInput && suggestionsBox) {
        if (!searchInput.contains(e.target) && !suggestionsBox.contains(e.target)) {
            suggestionsBox.style.display = 'none';
        }
    }
});

function switchAdminTab(tabId) {
    document.querySelectorAll('.admin-tab').forEach(tab => {
        tab.classList.remove('active');
    });
    document.querySelectorAll('.nav-links li').forEach(li => {
        li.classList.remove('active');
    });

    document.getElementById(tabId).classList.add('active');
    
    const navId = tabId.replace('admin-', 'tab-admin-');
    document.getElementById(navId).classList.add('active');
}

function openAddDeploymentModal() {
    document.getElementById('add-deployment-modal').classList.add('active');
    handleCustomerSelection();
    
    // සම්පූර්ණ Link එකක් හැදෙන විදිහට වෙනස් කර ඇත (Clickable Endpoint URL)
    const randomId = 'BIO-' + Math.random().toString(36).substr(2, 6).toUpperCase();
    const fullLink = 'https://biogas-system-jh34.onrender.com/device/' + randomId;
    
    document.getElementById('unit-token').value = fullLink;
}

function closeAddDeploymentModal() {
    document.getElementById('add-deployment-modal').classList.remove('active');
    document.getElementById('deployment-msg').innerText = "";
}

function handleCustomerSelection() {
    const customerSelect = document.getElementById('customer-select').value;
    const newCustomerDiv = document.getElementById('new-customer-fields');
    const locationSelect = document.getElementById('location-select');
    
    if(customerSelect === 'new') {
        newCustomerDiv.style.display = 'block';
        locationSelect.innerHTML = '<option value="new">+ Create New Location</option>';
        locationSelect.disabled = true;
        handleLocationSelection();
    } else {
        newCustomerDiv.style.display = 'none';
        locationSelect.disabled = false;
        
        locationSelect.innerHTML = '<option value="new">+ Create New Location</option>';
        for (const [locId, loc] of Object.entries(globalLocations)) {
            if (loc.customerId === customerSelect) {
                const opt = document.createElement('option');
                opt.value = locId;
                opt.textContent = loc.locationName;
                locationSelect.appendChild(opt);
            }
        }
        handleLocationSelection();
    }
}

function handleLocationSelection() {
    const locSelect = document.getElementById('location-select').value;
    const newLocDiv = document.getElementById('new-location-fields');
    
    if (locSelect === 'new') {
        newLocDiv.style.display = 'block';
    } else {
        newLocDiv.style.display = 'none';
    }
}

async function saveNewDeployment() {
    const msgDiv = document.getElementById('deployment-msg');
    if(msgDiv) msgDiv.innerHTML = "Saving deployment...";

    let customerId = document.getElementById('customer-select').value;
    let locationId = document.getElementById('location-select').value;
    let generatedCredentials = null;

    try {
        if (customerId === 'new') {
            const custName = document.getElementById('cust-name').value.trim();
            const custPhone = document.getElementById('cust-phone').value.trim();

            if (!custName || !custPhone) {
                if(msgDiv) msgDiv.innerHTML = "<span style='color: #ef4444;'>Please fill Customer Name and Phone!</span>";
                return;
            }

            const uniqueClientId = 'CUST-' + Math.random().toString(36).substr(2, 5).toUpperCase();
            const autoEmail = uniqueClientId.toLowerCase() + '@biogas.com';
            const autoPass = Math.random().toString(36).slice(-8);
            const loginLink = `https://biogas-system-gay5.vercel.app/?client=${uniqueClientId}`;

            customerId = await window.createCustomerAuthAccount(autoEmail, autoPass);
            
            await window.dbSet(window.dbRef(window.firebaseDB, `users/${customerId}`), {
                role: 'customer',
                name: custName,
                phone: custPhone,
                email: autoEmail,
                rawPass: autoPass,
                clientId: uniqueClientId,
                loginLink: loginLink,
                accessGranted: true,
                createdAt: new Date().toISOString()
            });

            generatedCredentials = { user: autoEmail, pass: autoPass, login: loginLink };
        }

        if (locationId === 'new') {
            const locName = document.getElementById('loc-name').value.trim();
            const locAddress = document.getElementById('loc-address').value.trim();

            if (!locName) {
                if(msgDiv) msgDiv.innerHTML = "<span style='color: #ef4444;'>Please fill Location Name!</span>";
                return;
            }

            const newLocRef = window.dbPush(window.dbRef(window.firebaseDB, 'locations'));
            locationId = newLocRef.key;
            
            await window.dbSet(newLocRef, {
                customerId: customerId,
                locationName: locName,
                address: locAddress,
                createdAt: new Date().toISOString()
            });
        }

        const unitName = document.getElementById('unit-name').value.trim() || 'Unit 1';
        const unitToken = document.getElementById('unit-token').value;

        if (!unitToken) {
            if(msgDiv) msgDiv.innerHTML = "<span style='color: #ef4444;'>System Link generation failed!</span>";
            return;
        }

        const newUnitRef = window.dbPush(window.dbRef(window.firebaseDB, 'units'));
        const unitId = newUnitRef.key;
        
        await window.dbSet(newUnitRef, {
            locationId: locationId,
            unitToken: unitToken,
            unitName: unitName,
            status: 'active',
            createdAt: new Date().toISOString()
        });

        closeAddDeploymentModal();
        
        if (generatedCredentials) {
            document.getElementById('succ-user').innerText = generatedCredentials.user;
            document.getElementById('succ-pass').innerText = generatedCredentials.pass;
            document.getElementById('succ-login').innerText = generatedCredentials.login;
            document.getElementById('succ-device').innerText = unitToken;
            document.getElementById('success-deployment-modal').classList.add('active');
        } else {
            alert("New Unit Added Successfully!");
        }
        
        if(msgDiv) msgDiv.innerHTML = "";

    } catch (error) {
        console.error(error);
        if(msgDiv) msgDiv.innerHTML = `<span style='color: #ef4444;'>Error: ${error.message}</span>`;
    }
}

document.getElementById('admin-logout-btn')?.addEventListener('click', () => {
    if (window.firebaseAuth) {
        window.firebaseAuth.signOut().then(() => {
            document.getElementById('admin-screen').classList.remove('active');
            document.getElementById('login-screen').classList.add('active');
            currentUser = null;
        }).catch(err => console.error(err));
    } else {
        document.getElementById('admin-screen').classList.remove('active');
        document.getElementById('login-screen').classList.add('active');
        currentUser = null;
    }
});

// ==========================================
// --- HISTORY & DATA LOGGING LOGIC ---
// ==========================================

function fetchHistoryData() {
    const unitId = globalSelectedUnitId; // 🔴 වෙනස් කළ ස්ථානය
    const dateVal = document.getElementById('history-date-select').value; 
    const tbody = document.getElementById('history-tbody');

    if (!unitId) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 40px; color: #9CA3AF;">Please select a unit from the top dropdown to view data logs.</td></tr>';
        return;
    }
    
    tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 40px;">Loading historical data...</td></tr>';

    window.dbGet(window.dbRef(window.firebaseDB, `sensor_logs/${unitId}`)).then((snapshot) => {
        if (!snapshot.exists()) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 40px; color: #EF4444;">No historical records found for this unit.</td></tr>';
            return;
        }
        
        const logs = snapshot.val();
        let rowsHtml = '';
        let hasData = false;
        
        for (const [logId, data] of Object.entries(logs)) {
            const logDate = data.timestamp ? data.timestamp.split('T')[0] : '';
            if (dateVal && logDate !== dateVal) continue; 
            
            hasData = true;
            const time = data.timestamp ? new Date(data.timestamp).toLocaleTimeString() : 'N/A';
            rowsHtml += `
                <tr>
                    <td style="font-weight: 500; color: var(--text-dark);">${time}</td>
                    <td>${data.ch4 != null ? data.ch4.toFixed(2) : '-'}</td>
                    <td>${data.co2 != null ? data.co2.toFixed(2) : '-'}</td>
                    <td>${data.h2s != null ? data.h2s.toFixed(2) : '-'}</td>
                    <td>${data.temperature != null ? data.temperature.toFixed(1) : '-'}</td>
                    <td>${data.ph != null ? data.ph.toFixed(2) : '-'}</td>
                    <td>${data.gasVolume != null ? data.gasVolume.toFixed(2) : '-'}</td>
                </tr>
            `;
        }
        
        if (!hasData) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 40px; color: #F59E0B;">No records found for the selected date.</td></tr>';
        } else {
            tbody.innerHTML = rowsHtml;
        }
    }).catch(err => {
        console.error(err);
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 40px; color: #EF4444;">Error loading data. Check console.</td></tr>';
    });
}

// ==========================================
// --- EXPORT TO CSV & PDF ---
// ==========================================

function exportToCSV() {
    const table = document.getElementById('history-table');
    if (!table) return;

    let csvContent = "";
    
    // මේසයේ ඇති සියලුම පේළි (Rows) කියවීම
    for (let i = 0; i < table.rows.length; i++) {
        let rowData = [];
        let cols = table.rows[i].querySelectorAll("td, th");
        
        // දත්ත නොමැති විට එන පණිවිඩය Export වීම වැළැක්වීම
        if (cols.length === 1 && cols[0].colSpan === 7) continue;

        for (let j = 0; j < cols.length; j++) {
            // කොමා (,) සහිත දත්ත තිබේ නම් ඒවා වෙන් නොවන සේ සැකසීම
            let data = cols[j].innerText.replace(/"/g, '""');
            rowData.push('"' + data + '"');
        }
        csvContent += rowData.join(",") + "\r\n";
    }

    if(csvContent.trim() === "") {
        alert("No data available to export.");
        return;
    }

    // CSV ගොනුව බාගත කිරීම
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    
    link.setAttribute("href", url);
    link.setAttribute("download", `Biogas_Data_Log_${new Date().getTime()}.csv`);
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function exportToPDF() {
    const table = document.getElementById('history-table');
    // දත්ත නොමැති දැයි පරීක්ෂා කිරීම
    if (!table || table.rows.length < 2 || (table.rows.length === 2 && table.rows[1].cells.length === 1)) {
        alert("No data available to export.");
        return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('l', 'mm', 'a4'); // Landscape A4

    // PDF හි මාතෘකාව (Header) සැකසීම
    doc.setFontSize(18);
    doc.setTextColor(34, 34, 34);
    doc.text("Biogas Plant - Historical Data Report", 14, 22);
    
    doc.setFontSize(11);
    doc.setTextColor(100, 100, 100);
    const dateVal = document.getElementById('history-date-select').value || 'All Available Data';
    doc.text(`Filtered Date: ${dateVal} | Generated on: ${new Date().toLocaleString()}`, 14, 30);

    // AutoTable හරහා HTML Table එක PDF එකට ඇඳීම
    doc.autoTable({
        html: '#history-table',
        startY: 38,
        theme: 'grid',
        headStyles: { fillColor: [34, 34, 34], textColor: [255, 255, 255] },
        styles: { fontSize: 10, cellPadding: 4 },
        alternateRowStyles: { fillColor: [248, 250, 252] }
    });

    doc.save(`Biogas_Report_${new Date().getTime()}.pdf`);
}

// ==========================================
// --- WHATSAPP STYLE CHAT LOGIC (UNIT-BASED) ---
// ==========================================

let activeChatUnitId = null; // Admin සඳහා තෝරාගත් Unit ID එක
let customerChatUnsub = null; // පරණ Listeners අක්‍රිය කිරීමට

// --- CUSTOMER SIDE ---
function initCustomerChat() {
    if(!currentUser || currentUser.role !== 'customer') return;
    loadCustomerChatForUnit();
}

function loadCustomerChatForUnit() {
    const container = document.getElementById('cust-chat-messages');
    const badge = document.getElementById('cust-chat-status');
    if(!container) return;

    if (!globalSelectedUnitId) {
        container.innerHTML = '<div style="padding: 20px; text-align: center; color: #9CA3AF;">Please select a biogas unit from the top dropdown to view its support history.</div>';
        if (badge) badge.style.display = 'none';
        return;
    }

    if (badge) badge.style.display = 'inline-block';

    // කලින් තිබුණු Listener එකක් ඇත්නම් එය නවත්වන්න
    if (customerChatUnsub) {
        customerChatUnsub();
    }

    // 🔴 Customer ID එක වෙනුවට කෙළින්ම Unit ID එකෙන් Chat එක සෑදීම
    const chatRef = window.dbRef(window.firebaseDB, `chats/${globalSelectedUnitId}`);
    
    customerChatUnsub = window.dbOnValue(chatRef, (snapshot) => {
        const chatData = snapshot.val() || {};
        const messages = chatData.messages || {};
        const status = chatData.status || 'active';
        
        if(badge) {
            if(status === 'resolved') {
                badge.className = 'badge inactive';
                badge.innerText = 'RESOLVED';
                badge.style.backgroundColor = '#E5E7EB';
                badge.style.color = '#374151';
            } else {
                badge.className = 'badge active';
                badge.innerText = 'ACTIVE';
                badge.style.backgroundColor = ''; 
                badge.style.color = '';
            }
        }

        container.innerHTML = '';
        
        for(const [msgId, msg] of Object.entries(messages)) {
            const isSentByMe = msg.sender === 'customer';
            const time = new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
            
            let mediaHtml = '';
            if (msg.imageUrl) {
                mediaHtml = `<img src="${msg.imageUrl}" style="max-width: 100%; max-height: 200px; border-radius: 8px; margin-bottom: 5px; cursor: pointer; border: 1px solid #E5E7EB;" onclick="window.open('${msg.imageUrl}', '_blank')"><br>`;
            }
            if (msg.audioUrl) {
                mediaHtml = `<audio controls src="${msg.audioUrl}" style="max-width: 200px; height: 35px; margin-bottom: 5px;"></audio><br>`;
            }

            container.innerHTML += `
                <div class="chat-bubble ${isSentByMe ? 'bubble-sent' : 'bubble-received'}">
                    ${mediaHtml}
                    ${msg.text}
                    <span class="chat-timestamp">${time}</span>
                </div>
            `;
        }
        container.scrollTop = container.scrollHeight;
    });
}

async function sendCustMessage() {
    const input = document.getElementById('cust-chat-input');
    const text = input.value.trim();
    if(!text || !globalSelectedUnitId) return;
    
    input.value = '';
    const msgRef = window.dbPush(window.dbRef(window.firebaseDB, `chats/${globalSelectedUnitId}/messages`));
    await window.dbSet(msgRef, {
        sender: 'customer',
        text: text,
        timestamp: new Date().toISOString()
    });
    
    window.dbSet(window.dbRef(window.firebaseDB, `chats/${globalSelectedUnitId}/status`), 'active');
    window.dbSet(window.dbRef(window.firebaseDB, `chats/${globalSelectedUnitId}/lastUpdated`), new Date().toISOString());
}

function handleCustChatEnter(e) {
    if (e.key === 'Enter') sendCustMessage();
}


// --- ADMIN SIDE ---
function initAdminChat() {
    if(!currentUser || currentUser.role !== 'admin') return;
    
    const chatsRef = window.dbRef(window.firebaseDB, 'chats');
    
    window.dbOnValue(chatsRef, (snapshot) => {
        const chatList = document.getElementById('admin-chat-list');
        if(!chatList) return;
        
        const allChats = snapshot.val() || {};
        chatList.innerHTML = '';
        
        // අලුත්ම මැසේජ් උඩට එන ලෙස Sort කිරීම
        const sortedUnitIds = Object.keys(allChats).sort((a, b) => {
            return new Date(allChats[b].lastUpdated || 0) - new Date(allChats[a].lastUpdated || 0);
        });
        
        if(sortedUnitIds.length === 0) {
            chatList.innerHTML = '<p style="padding: 20px; color: #9CA3AF;">No active conversations.</p>';
            return;
        }

        sortedUnitIds.forEach(unitId => {
            const unitInfo = globalUnits[unitId];
            if (!unitInfo) return; 
            
            const loc = globalLocations[unitInfo.locationId] || {};
            const cust = globalCustomers[loc.customerId] || { name: 'Unknown Customer', phone: '' };
            
            const unitName = unitInfo.unitName || unitInfo.name || "Unit";
            const locName = loc.locationName || loc.name || "Location";
            const displayTitle = `${locName} - ${unitName}`; 
            
            const msgs = allChats[unitId].messages || {};
            const msgKeys = Object.keys(msgs);
            
            // 🔴 අලුත්: Unread Messages ගණනය කිරීම (WhatsApp Style)
            let unreadCount = 0;
            msgKeys.forEach(key => {
                if(msgs[key].sender === 'customer' && !msgs[key].read) {
                    unreadCount++;
                }
            });

            let lastMsg = 'No messages';
            if (msgKeys.length > 0) {
                const lastM = msgs[msgKeys[msgKeys.length-1]];
                lastMsg = lastM.imageUrl ? '📷 Image' : (lastM.audioUrl ? '🎤 Voice message' : lastM.text);
            }
            
            const div = document.createElement('div');
            div.className = `chat-list-item ${unitId === activeChatUnitId ? 'active' : ''}`;
            div.onclick = () => openAdminChat(unitId, cust, displayTitle);
            
            // 🔴 අලුත් UI: කොළ පාට Notification Badge එක සහ Bold Text
            div.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <h4 style="margin: 0; font-size: 14px; color: #111827;">${displayTitle}</h4>
                    ${unreadCount > 0 ? `<span style="background: #10B981; color: white; border-radius: 50px; min-width: 20px; height: 20px; padding: 0 6px; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: bold; box-shadow: 0 2px 4px rgba(0,0,0,0.15);">${unreadCount}</span>` : ''}
                </div>
                <p style="margin: 2px 0 4px 0; font-size: 11px; color: #4B5563; font-weight: 600;">👤 ${cust.name}</p>
                <p style="margin: 0; font-size: 12px; color: ${unreadCount > 0 ? '#0F172A' : '#6B7280'}; font-weight: ${unreadCount > 0 ? '700' : 'normal'}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${lastMsg}</p>
            `;
            chatList.appendChild(div);
        });
        
        if(activeChatUnitId && allChats[activeChatUnitId]) {
            renderAdminMessages(allChats[activeChatUnitId].messages || {});
        }
    });
}

function openAdminChat(unitId, cust, displayTitle) {
    activeChatUnitId = unitId;
    document.getElementById('admin-chat-placeholder').style.display = 'none';
    document.getElementById('admin-chat-window').style.display = 'flex';
    
    document.getElementById('active-chat-name').innerHTML = `${displayTitle} <span id="admin-chat-status" class="badge" style="font-size: 10px; padding: 4px 8px;"></span>`;
    document.getElementById('active-chat-phone').innerText = `Customer: ${cust.name} | 📞 ${cust.phone}`;
    
    document.querySelectorAll('.chat-list-item').forEach(el => el.classList.remove('active'));
    if(event && event.currentTarget) event.currentTarget.classList.add('active');
    
    window.dbOnValue(window.dbRef(window.firebaseDB, `chats/${unitId}`), (snap) => {
        if(activeChatUnitId !== unitId) return; 
        
        const chatData = snap.val() || {};
        const status = chatData.status || 'active';
        const badge = document.getElementById('admin-chat-status');
        const resolveBtn = document.getElementById('btn-resolve');
        
        if(status === 'resolved') {
            badge.className = 'badge inactive';
            badge.innerText = 'RESOLVED';
            badge.style.backgroundColor = '#E5E7EB';
            badge.style.color = '#374151';
            resolveBtn.style.display = 'none'; 
        } else {
            badge.className = 'badge active';
            badge.innerText = 'ACTIVE';
            badge.style.backgroundColor = ''; 
            badge.style.color = '';
            resolveBtn.style.display = 'block'; 
        }
        
        const messages = chatData.messages || {};
        renderAdminMessages(messages);

        // 🔴 අලුත්: Admin චැට් එක ඕපන් කළාම, ඒකේ තියෙන Customer ගේ අලුත් පණිවිඩ ඔක්කොම "read" කරනවා
        const updates = {};
        let hasUnread = false;
        for(const [msgId, msg] of Object.entries(messages)) {
            if(msg.sender === 'customer' && !msg.read) {
                updates[`chats/${unitId}/messages/${msgId}/read`] = true;
                hasUnread = true;
            }
        }
        
        if(hasUnread && typeof window.dbUpdate === 'function') {
            window.dbUpdate(window.dbRef(window.firebaseDB), updates);
        }
    });
}

function markAsResolved() {
    if(!activeChatUnitId) return;
    
    if(confirm("Are you sure you want to mark this complaint as resolved?")) {
        window.dbSet(window.dbRef(window.firebaseDB, `chats/${activeChatUnitId}/status`), 'resolved');
        
        const msgRef = window.dbPush(window.dbRef(window.firebaseDB, `chats/${activeChatUnitId}/messages`));
        window.dbSet(msgRef, {
            sender: 'admin',
            text: "✅ This complaint has been marked as RESOLVED by the Admin. If you need further assistance regarding this unit, simply send a new message.",
            timestamp: new Date().toISOString()
        });
        
        window.dbSet(window.dbRef(window.firebaseDB, `chats/${activeChatUnitId}/lastUpdated`), new Date().toISOString());
    }
}

function renderAdminMessages(messages) {
    const container = document.getElementById('admin-chat-messages');
    if(!container) return;
    container.innerHTML = '';
    
    for(const [msgId, msg] of Object.entries(messages)) {
        const isSentByMe = msg.sender === 'admin';
        const time = new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        
        let mediaHtml = '';
        if (msg.imageUrl) {
            mediaHtml = `<img src="${msg.imageUrl}" style="max-width: 100%; max-height: 200px; border-radius: 8px; margin-bottom: 5px; cursor: pointer; border: 1px solid #E5E7EB;" onclick="window.open('${msg.imageUrl}', '_blank')"><br>`;
        }
        if (msg.audioUrl) {
            mediaHtml = `<audio controls src="${msg.audioUrl}" style="max-width: 200px; height: 35px; margin-bottom: 5px;"></audio><br>`;
        }

        container.innerHTML += `
            <div class="chat-bubble ${isSentByMe ? 'bubble-sent' : 'bubble-received'}">
                ${mediaHtml}
                ${msg.text}
                <span class="chat-timestamp">${time}</span>
            </div>
        `;
    }
    container.scrollTop = container.scrollHeight;
}

async function sendAdminMessage() {
    if(!activeChatUnitId) return;
    const input = document.getElementById('admin-chat-input');
    const text = input.value.trim();
    if(!text) return;
    
    input.value = '';
    const msgRef = window.dbPush(window.dbRef(window.firebaseDB, `chats/${activeChatUnitId}/messages`));
    await window.dbSet(msgRef, {
        sender: 'admin',
        text: text,
        timestamp: new Date().toISOString()
    });
    
    window.dbSet(window.dbRef(window.firebaseDB, `chats/${activeChatUnitId}/lastUpdated`), new Date().toISOString());
}

function handleAdminChatEnter(e) {
    if (e.key === 'Enter') sendAdminMessage();
}

// ==========================================
// --- SENSOR/UNIT MENTIONING LOGIC ---
// ==========================================

function triggerIssueReport() {
    const unitName = document.getElementById('live-unit-name').innerText;
    switchCustomerTab('cust-support');
    
    if (typeof loadCustomerChatForUnit === 'function') loadCustomerChatForUnit();
    
    const chatInput = document.getElementById('cust-chat-input');
    const mentionTag = `[🚨 Issue Report - ${unitName}] `;
    
    chatInput.value = mentionTag;
    chatInput.focus(); 
}

// ==========================================
// --- IMAGE UPLOAD & VOICE MESSAGE LOGIC ---
// ==========================================

const IMGBB_API_KEY = 'de52b99955e20c707ba407d2a2dd17fe'; 

async function handleImageUpload(event, senderRole) {
    const file = event.target.files[0];
    if(!file) return;
    event.target.value = ''; 

    const uid = senderRole === 'customer' ? globalSelectedUnitId : activeChatUnitId;
    if(!uid) return;

    const chatInput = senderRole === 'customer' ? document.getElementById('cust-chat-input') : document.getElementById('admin-chat-input');
    const originalPlaceholder = chatInput.placeholder;
    
    chatInput.placeholder = "Uploading image, please wait...";
    chatInput.disabled = true;

    try {
        const formData = new FormData();
        formData.append('image', file);

        const response = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, {
            method: 'POST',
            body: formData
        });

        const data = await response.json();
        
        if (data.success) {
            const msgRef = window.dbPush(window.dbRef(window.firebaseDB, `chats/${uid}/messages`));
            await window.dbSet(msgRef, {
                sender: senderRole,
                text: "📷 Image Attachment",
                imageUrl: data.data.url, 
                timestamp: new Date().toISOString()
            });

            window.dbSet(window.dbRef(window.firebaseDB, `chats/${uid}/status`), 'active');
            window.dbSet(window.dbRef(window.firebaseDB, `chats/${uid}/lastUpdated`), new Date().toISOString());
        } else {
            throw new Error("ImgBB upload failed");
        }
    } catch (error) {
        console.error("Upload Error:", error);
        alert("Image upload failed. Please try again.");
    } finally {
        chatInput.placeholder = originalPlaceholder;
        chatInput.disabled = false;
    }
}

let mediaRecorder;
let audioChunks = [];
let isRecording = false;

async function toggleVoiceRecord(senderRole) {
    const micBtnId = senderRole === 'customer' ? 'cust-mic-btn' : 'admin-mic-btn';
    const micBtn = document.getElementById(micBtnId);
    
    if (!isRecording) {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorder = new MediaRecorder(stream);
            audioChunks = [];
            
            mediaRecorder.ondataavailable = event => {
                audioChunks.push(event.data);
            };
            
            mediaRecorder.onstop = async () => {
                const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                const reader = new FileReader();
                reader.readAsDataURL(audioBlob);
                reader.onloadend = async () => {
                    const base64Audio = reader.result;
                    const uid = senderRole === 'customer' ? globalSelectedUnitId : activeChatUnitId;
                    
                    if(uid) {
                        const msgRef = window.dbPush(window.dbRef(window.firebaseDB, `chats/${uid}/messages`));
                        await window.dbSet(msgRef, {
                            sender: senderRole,
                            text: "🎤 Voice Message",
                            audioUrl: base64Audio,
                            timestamp: new Date().toISOString()
                        });
                        window.dbSet(window.dbRef(window.firebaseDB, `chats/${uid}/status`), 'active');
                        window.dbSet(window.dbRef(window.firebaseDB, `chats/${uid}/lastUpdated`), new Date().toISOString());
                    }
                };
            };
            
            mediaRecorder.start();
            isRecording = true;
            micBtn.style.color = 'red';
            micBtn.classList.add('recording-pulse');
        } catch (err) {
            console.error("Mic access denied:", err);
            alert("Please allow microphone access to send voice messages.");
        }
    } else {
        mediaRecorder.stop();
        mediaRecorder.stream.getTracks().forEach(track => track.stop()); 
        isRecording = false;
        micBtn.style.color = '#6B7280';
        micBtn.classList.remove('recording-pulse');
    }
}

// ==========================================
// --- REPORTS & ANALYTICS LOGIC ---
// ==========================================

let currentReportData = []; 
let currentReportTitle = "";

// Show custom date inputs if "Custom Range" is selected
document.getElementById('report-date-range').addEventListener('change', function(e) {
    const customDiv = document.getElementById('custom-date-inputs');
    if(customDiv) {
        customDiv.style.display = e.target.value === 'custom' ? 'flex' : 'none';
    }
});

function resetReportFilters() {
    document.getElementById('report-type-select').value = 'production';
    document.getElementById('report-date-range').value = '7days';
    const customDiv = document.getElementById('custom-date-inputs');
    if(customDiv) customDiv.style.display = 'none';
    
    document.getElementById('report-content').style.display = 'none';
    document.getElementById('report-export-actions').style.display = 'none';
    
    const loading = document.getElementById('report-loading');
    loading.style.display = 'block';
    loading.innerHTML = `
        <span style="font-size: 40px; display: block; margin-bottom: 10px;">📊</span>
        <p style="font-size: 16px; margin: 0;">Select your filters above and click <strong>"Generate Report"</strong> to analyze historical data.</p>
    `;
}

async function generateReport() {
    const reportType = document.getElementById('report-type-select').value;
    const dateRange = document.getElementById('report-date-range').value;
    const container = document.getElementById('report-content');
    const loading = document.getElementById('report-loading');
    const exportActions = document.getElementById('report-export-actions');

    loading.style.display = 'block';
    loading.innerHTML = "<p>Fetching real-time data from database...</p>";
    container.style.display = 'none';
    exportActions.style.display = 'none';

    const now = new Date();
    let startTime = new Date();
    
    if (dateRange === 'today') {
        startTime.setHours(0, 0, 0, 0);
    } else if (dateRange === '7days') {
        startTime.setDate(now.getDate() - 7);
    } else if (dateRange === '30days') {
        startTime.setDate(now.getDate() - 30);
    } else if (dateRange === 'custom') {
        const fromDate = document.getElementById('report-date-from').value;
        const toDate = document.getElementById('report-date-to').value;
        if(!fromDate || !toDate) {
            alert("Please select both 'From' and 'To' dates.");
            resetReportFilters();
            return;
        }
        startTime = new Date(fromDate);
        now.setTime(new Date(toDate).getTime() + 86399000); 
    }

    let targetUnitId = globalSelectedUnitId; // 🔴 වෙනස් කළ ස්ථානය

    if (!targetUnitId) {
        loading.innerHTML = "<p style='color:#991B1B'>No assigned biogas unit found. Please select a unit from the dropdown.</p>";
        return;
    }

    try {
        // 3. Fetch Historical Data from Firebase
        const snapshot = await window.dbGet(window.dbRef(window.firebaseDB, `sensor_logs/${targetUnitId}`));
        const allLogs = snapshot.exists() ? snapshot.val() : {};
        
        // 4. Filter Data based on selected date range
        currentReportData = Object.values(allLogs).filter(log => {
            const logTime = new Date(log.timestamp).getTime();
            return logTime >= startTime.getTime() && logTime <= now.getTime();
        });

        // Sort data chronologically
        currentReportData.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

        if (currentReportData.length === 0) {
            loading.innerHTML = `
                <span style="font-size: 40px; display: block; margin-bottom: 10px;">📭</span>
                <p style="font-size: 16px; margin: 0; color: #991B1B;">No data available for the selected date range.</p>
            `;
            return;
        }

        // 5. Generate specific report content
        // 5. Generate specific report content
       // 5. Generate specific report content
        let reportHTML = "";
        switch(reportType) {
            case 'production':
                reportHTML = buildProductionReport(currentReportData);
                currentReportTitle = "Biogas Production Report";
                break;
            case 'quality':
                reportHTML = buildQualityReport(currentReportData);
                currentReportTitle = "Gas Quality Report";
                break;
            case 'process':
                reportHTML = buildProcessReport(currentReportData);
                currentReportTitle = "Digester / Process Performance Report";
                break;
            case 'trend':
                reportHTML = buildTrendReport(currentReportData);
                currentReportTitle = "Historical Trend Analysis Report";
                break;    
            case 'safety':
                reportHTML = buildSafetyReport(currentReportData);
                currentReportTitle = "Safety & Alert Analysis Report";
                break;
            case 'insights':
                reportHTML = buildInsightsReport(currentReportData);
                currentReportTitle = "Early Warning & Trend Insights";
                break;
            case 'summary':
                reportHTML = buildSummaryReport(currentReportData);
                currentReportTitle = "System Summary Report";
                break;
            default:
                reportHTML = `
                    <div style="padding: 40px; text-align: center;">
                        <span style="font-size: 40px;">🚧</span>
                        <h3>Coming Soon</h3>
                        <p class="text-muted">This report type is currently under development.</p>
                    </div>
                `;
        }

        // 6. Update UI
        container.innerHTML = reportHTML;
        loading.style.display = 'none';
        container.style.display = 'block';
        exportActions.style.display = 'flex';

    } catch (error) {
        console.error("Report Error:", error);
        loading.innerHTML = "<p style='color:#991B1B'>Failed to generate report due to a database error.</p>";
    }
}

// -----------------------------------------------------
// REPORT BUILDERS
// -----------------------------------------------------

function buildProductionReport(data) {
    let totalVolume = 0;
    let maxVol = -Infinity;
    let minVol = Infinity;

    // Calculate actual metrics from array
    data.forEach(log => {
        const vol = Number(log.gasVolume) || 0;
        totalVolume += vol;
        if(vol > maxVol) maxVol = vol;
        if(vol < minVol) minVol = vol;
    });

    const avgVol = data.length > 0 ? (totalVolume / data.length).toFixed(2) : "0.00";
    const currentVol = data.length > 0 ? Number(data[data.length - 1].gasVolume || 0).toFixed(2) : "0.00";
    minVol = minVol === Infinity ? "0.00" : minVol.toFixed(2);
    maxVol = maxVol === -Infinity ? "0.00" : maxVol.toFixed(2);

    return `
        <div style="border-bottom: 2px solid #E5E7EB; padding-bottom: 16px; margin-bottom: 24px;">
            <h3 style="margin: 0; font-size: 20px; color: var(--text-dark);">Biogas Production Report</h3>
            <p style="margin: 4px 0 0 0; font-size: 13px; color: var(--text-muted);">Generated on: ${new Date().toLocaleString()}</p>
        </div>
        
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 24px;">
            <div class="param-card" style="background: #F8FAFC; border: 1px solid #E2E8F0; padding: 20px; text-align: left;">
                <p style="margin: 0; font-size: 12px; color: #64748B; font-weight: 600;">CURRENT / ENDING VOLUME</p>
                <h4 style="margin: 8px 0 0 0; font-size: 28px; color: #0F172A;">${currentVol} L</h4>
            </div>
            <div class="param-card" style="background: #F8FAFC; border: 1px solid #E2E8F0; padding: 20px; text-align: left;">
                <p style="margin: 0; font-size: 12px; color: #64748B; font-weight: 600;">AVERAGE PRODUCTION</p>
                <h4 style="margin: 8px 0 0 0; font-size: 28px; color: #0F172A;">${avgVol} L</h4>
            </div>
            <div class="param-card" style="background: #DCFCE7; border: 1px solid #bbf7d0; padding: 20px; text-align: left;">
                <p style="margin: 0; font-size: 12px; color: #166534; font-weight: 600;">MAXIMUM VOLUME</p>
                <h4 style="margin: 8px 0 0 0; font-size: 28px; color: #14532d;">${maxVol} L</h4>
            </div>
            <div class="param-card" style="background: #FEE2E2; border: 1px solid #fecaca; padding: 20px; text-align: left;">
                <p style="margin: 0; font-size: 12px; color: #991B1B; font-weight: 600;">MINIMUM VOLUME</p>
                <h4 style="margin: 8px 0 0 0; font-size: 28px; color: #7f1d1d;">${minVol} L</h4>
            </div>
        </div>

        <div class="param-card" style="border: 1px solid #E5E7EB; padding: 20px; text-align: left;">
            <h4 style="margin: 0 0 16px 0; font-size: 16px; color: var(--text-dark);">Production Trend Insight</h4>
            <p style="font-size: 14px; color: var(--text-muted); line-height: 1.6; margin: 0;">
                Based on <strong>${data.length}</strong> valid sensor readings over the selected period. 
                The system reached a peak production volume of <strong>${maxVol} L</strong>. 
                Currently, the digester is holding <strong>${currentVol} L</strong> of biogas.
            </p>
        </div>
    `;
}

function buildQualityReport(data) {
    let sumCH4 = 0, sumCO2 = 0, sumH2S = 0;
    let maxCH4 = -Infinity, maxCO2 = -Infinity, maxH2S = -Infinity;

    data.forEach(log => {
        const ch4 = Number(log.ch4) || 0;
        const co2 = Number(log.co2) || 0;
        const h2s = Number(log.h2s) || 0;
        
        sumCH4 += ch4; sumCO2 += co2; sumH2S += h2s;
        
        if(ch4 > maxCH4) maxCH4 = ch4;
        if(co2 > maxCO2) maxCO2 = co2;
        if(h2s > maxH2S) maxH2S = h2s;
    });

    const count = data.length;
    const avgCH4 = count > 0 ? (sumCH4 / count).toFixed(2) : "0.00";
    const avgCO2 = count > 0 ? (sumCO2 / count).toFixed(2) : "0.00";
    const avgH2S = count > 0 ? (sumH2S / count).toFixed(2) : "0.00";
    
    maxCH4 = maxCH4 === -Infinity ? "0.00" : maxCH4.toFixed(2);
    maxH2S = maxH2S === -Infinity ? "0.00" : maxH2S.toFixed(2);

    const latest = count > 0 ? data[count - 1] : { ch4: 0, co2: 0, h2s: 0 };
    
    // Safety Threshold Check
    let statusColor = "#166534"; // Green
    let statusBg = "#DCFCE7";
    let statusText = "NORMAL (Optimal Quality)";
    if (latest.h2s > 1.8) {
        statusColor = "#991B1B"; // Red
        statusBg = "#FEE2E2";
        statusText = "CRITICAL (High H2S Detected)";
    }

    return `
        <div style="border-bottom: 2px solid #E5E7EB; padding-bottom: 16px; margin-bottom: 24px; display: flex; justify-content: space-between; align-items: flex-end;">
            <div>
                <h3 style="margin: 0; font-size: 20px; color: var(--text-dark);">Gas Quality Analysis</h3>
                <p style="margin: 4px 0 0 0; font-size: 13px; color: var(--text-muted);">Total Readings Analyzed: ${count}</p>
            </div>
            <div style="background: ${statusBg}; color: ${statusColor}; padding: 6px 12px; border-radius: 20px; font-size: 12px; font-weight: 700;">
                STATUS: ${statusText}
            </div>
        </div>
        
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 16px; margin-bottom: 24px;">
            <div class="param-card" style="border: 1px solid #E5E7EB; padding: 20px;">
                <h4 style="margin: 0 0 12px 0; color: #0284C7; font-size: 16px;">Methane (CH4)</h4>
                <div style="display: flex; justify-content: space-between; margin-bottom: 8px;"><span style="color: var(--text-muted);">Average:</span> <strong>${avgCH4} %</strong></div>
                <div style="display: flex; justify-content: space-between; margin-bottom: 8px;"><span style="color: var(--text-muted);">Maximum:</span> <strong>${maxCH4} %</strong></div>
                <div style="display: flex; justify-content: space-between; border-top: 1px solid #F3F4F6; padding-top: 8px; margin-top: 8px;"><span style="color: var(--text-muted);">Latest Value:</span> <strong style="color: var(--text-dark);">${Number(latest.ch4).toFixed(2)} %</strong></div>
            </div>
            
            <div class="param-card" style="border: 1px solid #E5E7EB; padding: 20px;">
                <h4 style="margin: 0 0 12px 0; color: #D97706; font-size: 16px;">Hydrogen Sulfide (H2S)</h4>
                <div style="display: flex; justify-content: space-between; margin-bottom: 8px;"><span style="color: var(--text-muted);">Average:</span> <strong>${avgH2S} ppm</strong></div>
                <div style="display: flex; justify-content: space-between; margin-bottom: 8px;"><span style="color: var(--text-muted);">Maximum:</span> <strong style="${maxH2S > 1.8 ? 'color: red;' : ''}">${maxH2S} ppm</strong></div>
                <div style="display: flex; justify-content: space-between; border-top: 1px solid #F3F4F6; padding-top: 8px; margin-top: 8px;"><span style="color: var(--text-muted);">Latest Value:</span> <strong style="color: var(--text-dark);">${Number(latest.h2s).toFixed(2)} ppm</strong></div>
            </div>
            
            <div class="param-card" style="border: 1px solid #E5E7EB; padding: 20px;">
                <h4 style="margin: 0 0 12px 0; color: #4B5563; font-size: 16px;">Carbon Dioxide (CO2)</h4>
                <div style="display: flex; justify-content: space-between; margin-bottom: 8px;"><span style="color: var(--text-muted);">Average:</span> <strong>${avgCO2} %</strong></div>
                <div style="display: flex; justify-content: space-between; border-top: 1px solid #F3F4F6; padding-top: 8px; margin-top: 8px;"><span style="color: var(--text-muted);">Latest Value:</span> <strong style="color: var(--text-dark);">${Number(latest.co2).toFixed(2)} %</strong></div>
            </div>
        </div>
    `;
}

function buildProcessReport(data) {
    let sumTemp = 0, sumpH = 0, sumPressure = 0;
    let maxTemp = -Infinity, minpH = Infinity, maxPressure = -Infinity;

    data.forEach(log => {
        const t = Number(log.temperature) || 0;
        const p = Number(log.ph) || 0;
        const pr = Number(log.pressure) || 0;
        
        sumTemp += t; sumpH += p; sumPressure += pr;
        
        if(t > maxTemp) maxTemp = t;
        if(p < minpH) minpH = p;
        if(pr > maxPressure) maxPressure = pr;
    });

    const count = data.length;
    const avgTemp = count > 0 ? (sumTemp / count).toFixed(1) : "0.0";
    const avgpH = count > 0 ? (sumpH / count).toFixed(2) : "0.00";
    const avgPressure = count > 0 ? (sumPressure / count).toFixed(2) : "0.00";
    
    maxTemp = maxTemp === -Infinity ? "0.0" : maxTemp.toFixed(1);
    minpH = minpH === Infinity ? "0.00" : minpH.toFixed(2);
    maxPressure = maxPressure === -Infinity ? "0.00" : maxPressure.toFixed(2);

    return `
        <div style="border-bottom: 2px solid #E5E7EB; padding-bottom: 16px; margin-bottom: 24px;">
            <h3 style="margin: 0; font-size: 20px; color: var(--text-dark);">Digester Process Performance</h3>
            <p style="margin: 4px 0 0 0; font-size: 13px; color: var(--text-muted);">Monitoring critical environmental parameters for optimal biogas yield.</p>
        </div>
        
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px;">
            <div class="param-card" style="background: #F8FAFC; border: 1px solid #E2E8F0; padding: 20px;">
                <p style="margin: 0; font-size: 12px; color: #64748B; font-weight: 600;">AVERAGE TEMPERATURE</p>
                <h4 style="margin: 8px 0 0 0; font-size: 28px; color: #0F172A;">${avgTemp} °C</h4>
                <p style="margin: 8px 0 0 0; font-size: 11px; color: #94A3B8;">Peak recorded: ${maxTemp} °C</p>
            </div>
            <div class="param-card" style="background: #F8FAFC; border: 1px solid #E2E8F0; padding: 20px;">
                <p style="margin: 0; font-size: 12px; color: #64748B; font-weight: 600;">AVERAGE pH LEVEL</p>
                <h4 style="margin: 8px 0 0 0; font-size: 28px; color: #0F172A;">${avgpH}</h4>
                <p style="margin: 8px 0 0 0; font-size: 11px; color: #94A3B8;">Lowest recorded: ${minpH}</p>
            </div>
            <div class="param-card" style="background: #F8FAFC; border: 1px solid #E2E8F0; padding: 20px;">
                <p style="margin: 0; font-size: 12px; color: #64748B; font-weight: 600;">AVERAGE PRESSURE</p>
                <h4 style="margin: 8px 0 0 0; font-size: 28px; color: #0F172A;">${avgPressure} bar</h4>
                <p style="margin: 8px 0 0 0; font-size: 11px; color: #94A3B8;">Max recorded: ${maxPressure} bar</p>
            </div>
        </div>
    `;
}

function buildSafetyReport(data) {
    let totalAlerts = 0, highPressureCount = 0, highH2SCount = 0, phIssueCount = 0;
    let alertRows = '';

    // අලුත්ම දත්ත මුලින් පෙන්වීමට Reverse කිරීම
    const reversedData = [...data].reverse();

    reversedData.forEach(log => {
        let isAlert = false;
        let issues = [];
        
        if (Number(log.pressure) > 1.3) { highPressureCount++; issues.push(`High Pressure (${log.pressure} bar)`); isAlert = true; }
        if (Number(log.h2s) > 1.8) { highH2SCount++; issues.push(`High H2S (${log.h2s} ppm)`); isAlert = true; }
        if (Number(log.ph) < 6.0 || Number(log.ph) > 8.0) { phIssueCount++; issues.push(`pH Imbalance (${log.ph})`); isAlert = true; }

        if (isAlert) {
            totalAlerts++;
            // වගුවේ පෙන්වීමට අවසන් අනතුරු ඇඟවීම් 10 පමණක් තෝරා ගැනීම
            if (totalAlerts <= 10) {
                const time = new Date(log.timestamp).toLocaleString();
                alertRows += `
                    <tr>
                        <td style="padding: 12px; border-bottom: 1px solid #E5E7EB; font-size: 13px;">${time}</td>
                        <td style="padding: 12px; border-bottom: 1px solid #E5E7EB; color: #991B1B; font-size: 13px; font-weight: 600;">${issues.join(', ')}</td>
                        <td style="padding: 12px; border-bottom: 1px solid #E5E7EB; font-size: 13px;"><span style="background: #FEE2E2; color: #991B1B; padding: 4px 8px; border-radius: 4px;">CRITICAL</span></td>
                    </tr>
                `;
            }
        }
    });

    return `
        <div style="border-bottom: 2px solid #E5E7EB; padding-bottom: 16px; margin-bottom: 24px;">
            <h3 style="margin: 0; font-size: 20px; color: var(--text-dark);">Safety & Alert Analysis</h3>
            <p style="margin: 4px 0 0 0; font-size: 13px; color: var(--text-muted);">Based on system-configured safety thresholds.</p>
        </div>
        
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 16px; margin-bottom: 24px;">
            <div class="param-card" style="background: #FEF2F2; border: 1px solid #FCA5A5; padding: 20px; text-align: center;">
                <h4 style="margin: 0; font-size: 32px; color: #991B1B;">${totalAlerts}</h4>
                <p style="margin: 4px 0 0 0; font-size: 12px; color: #7F1D1D; font-weight: 600;">TOTAL ALERTS</p>
            </div>
            <div class="param-card" style="border: 1px solid #E5E7EB; padding: 20px; text-align: center;">
                <h4 style="margin: 0; font-size: 24px; color: #D97706;">${highH2SCount}</h4>
                <p style="margin: 4px 0 0 0; font-size: 12px; color: var(--text-muted);">H2S WARNINGS</p>
            </div>
            <div class="param-card" style="border: 1px solid #E5E7EB; padding: 20px; text-align: center;">
                <h4 style="margin: 0; font-size: 24px; color: #0284C7;">${highPressureCount}</h4>
                <p style="margin: 4px 0 0 0; font-size: 12px; color: var(--text-muted);">PRESSURE WARNINGS</p>
            </div>
        </div>

        <h4 style="margin: 0 0 16px 0; font-size: 16px; color: var(--text-dark);">Recent Alert History</h4>
        <div style="overflow-x: auto;">
            <table style="width: 100%; border-collapse: collapse; text-align: left;">
                <thead>
                    <tr style="background: #F3F4F6;">
                        <th style="padding: 12px; font-size: 12px; color: #4B5563;">DATE & TIME</th>
                        <th style="padding: 12px; font-size: 12px; color: #4B5563;">TRIGGERED PARAMETERS</th>
                        <th style="padding: 12px; font-size: 12px; color: #4B5563;">STATUS</th>
                    </tr>
                </thead>
                <tbody>
                    ${alertRows || '<tr><td colspan="3" style="padding: 20px; text-align: center; color: #166534;">✅ No alerts recorded in this period.</td></tr>'}
                </tbody>
            </table>
        </div>
    `;
}

function buildInsightsReport(data) {
    if(data.length < 2) return `<p>Not enough data to generate insights.</p>`;
    
    // දත්ත දෙකට කඩා සංසන්දනය කිරීම (පළමු අර්ධය සහ දෙවන අර්ධය)
    const mid = Math.floor(data.length / 2);
    const firstHalf = data.slice(0, mid);
    const secondHalf = data.slice(mid);
    
    const getAvg = (arr, key) => arr.reduce((sum, val) => sum + (Number(val[key])||0), 0) / arr.length;
    
    const h2sTrend = getAvg(secondHalf, 'h2s') > getAvg(firstHalf, 'h2s') ? 'Increasing 📈' : 'Decreasing 📉';
    const prodTrend = getAvg(secondHalf, 'gasVolume') > getAvg(firstHalf, 'gasVolume') ? 'Increasing 📈' : 'Decreasing 📉';
    
    const latest = data[data.length - 1];
    let warnings = "";
    
    if (latest.h2s > 1.5 && latest.h2s <= 1.8) warnings += `<p style="color: #D97706; background: #FEF3C7; padding: 10px; border-radius: 6px; border: 1px solid #FDE68A;">⚠️ <strong>H2S Approaching Limit:</strong> Concentration is currently at ${latest.h2s} ppm.</p>`;
    if (latest.pressure > 1.1 && latest.pressure <= 1.3) warnings += `<p style="color: #D97706; background: #FEF3C7; padding: 10px; border-radius: 6px; border: 1px solid #FDE68A;">⚠️ <strong>Pressure Approaching Limit:</strong> System pressure is rising (${latest.pressure} bar).</p>`;
    
    return `
        <div style="border-bottom: 2px solid #E5E7EB; padding-bottom: 16px; margin-bottom: 24px;">
            <h3 style="margin: 0; font-size: 20px; color: var(--text-dark);">Early Warnings & Trend Insights</h3>
        </div>
        
        <div style="margin-bottom: 24px;">
            <h4 style="margin: 0 0 12px 0; font-size: 14px; color: var(--text-muted);">EARLY WARNINGS</h4>
            ${warnings || '<p style="color: #166534; background: #DCFCE7; padding: 10px; border-radius: 6px;">✅ All parameters are well within safe limits. No early warnings.</p>'}
        </div>

        <div>
            <h4 style="margin: 0 0 12px 0; font-size: 14px; color: var(--text-muted);">HISTORICAL TRENDS</h4>
            <ul style="line-height: 1.8; color: var(--text-dark); font-size: 14px; background: #F8FAFC; padding: 20px 40px; border-radius: 8px; border: 1px solid #E2E8F0;">
                <li>H2S concentration is showing a <strong>${h2sTrend}</strong> trend in the recent period.</li>
                <li>Overall Biogas production is <strong>${prodTrend}</strong> compared to the first half of the selected date range.</li>
            </ul>
        </div>
    `;
}

function buildSummaryReport(data) {
    // සරලව මූලික කරුණු සියල්ල එකට ගැනීම
    const latest = data[data.length - 1];
    return `
        <div style="border-bottom: 2px solid #E5E7EB; padding-bottom: 16px; margin-bottom: 24px;">
            <h3 style="margin: 0; font-size: 20px; color: var(--text-dark);">System Summary Snapshot</h3>
        </div>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px;">
            <div class="param-card" style="border: 1px solid #E5E7EB; padding: 20px;">
                <h4 style="margin: 0; color: var(--text-muted); font-size: 12px;">LATEST GAS VOLUME</h4>
                <p style="font-size: 24px; font-weight: 700; margin: 8px 0 0 0;">${latest.gasVolume} L</p>
            </div>
            <div class="param-card" style="border: 1px solid #E5E7EB; padding: 20px;">
                <h4 style="margin: 0; color: var(--text-muted); font-size: 12px;">CURRENT METHANE (CH4)</h4>
                <p style="font-size: 24px; font-weight: 700; margin: 8px 0 0 0; color: #0284C7;">${latest.ch4} %</p>
            </div>
            <div class="param-card" style="border: 1px solid #E5E7EB; padding: 20px;">
                <h4 style="margin: 0; color: var(--text-muted); font-size: 12px;">SYSTEM PRESSURE</h4>
                <p style="font-size: 24px; font-weight: 700; margin: 8px 0 0 0;">${latest.pressure} bar</p>
            </div>
        </div>
    `;
}

// ==========================================
// --- EXPORT TO CSV & PDF LOGIC ---
// ==========================================

function exportReportToCSV() {
    if (!currentReportData || currentReportData.length === 0) {
        alert("No data available to export.");
        return;
    }

    // 1. CSV Headers සැකසීම
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Timestamp,Gas Volume(L),CH4(%),CO2(%),H2S(ppm),Pressure(bar),Temperature(C),pH\n";

    // 2. Data පේළි එකතු කිරීම
    currentReportData.forEach(log => {
        // කොමා (,) වලින් වෙන් වන නිසා, දිනය/වේලාව තුළ ඇති කොමා ඉවත් කිරීම සුදුසුය
        let time = new Date(log.timestamp).toLocaleString().replace(/,/g, ''); 
        
        const vol = Number(log.gasVolume || 0).toFixed(2);
        const ch4 = Number(log.ch4 || 0).toFixed(2);
        const co2 = Number(log.co2 || 0).toFixed(2);
        const h2s = Number(log.h2s || 0).toFixed(2);
        const pres = Number(log.pressure || 0).toFixed(2);
        const temp = Number(log.temperature || 0).toFixed(1);
        const ph = Number(log.ph || 0).toFixed(2);

        csvContent += `${time},${vol},${ch4},${co2},${h2s},${pres},${temp},${ph}\n`;
    });

    // 3. බාගත කිරීම (Download)
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Biogas_Data_Export_${new Date().getTime()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function exportReportToPDF() {
    const reportElement = document.getElementById('report-preview-container');
    
    // PDF එක සකස් කළ යුතු ආකාරය (Settings)
    const opt = {
        margin:       15,
        filename:     `${currentReportTitle.replace(/\s+/g, '_')}_${new Date().getTime()}.pdf`,
        image:        { type: 'jpeg', quality: 0.98 },
        html2canvas:  { scale: 2, useCORS: true }, // scale:2 න් පැහැදිලිතාවය වැඩි කරයි
        jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    // PDF එක Generate කර Download කිරීම
    html2pdf().set(opt).from(reportElement).save();
}

function buildTrendReport(data) {
    if(data.length === 0) return `<p>No sufficient data to generate trends.</p>`;

    // දත්ත දෙකට කඩා සංසන්දනය කිරීම (Trend එක බැලීමට)
    const mid = Math.floor(data.length / 2);
    const firstHalf = data.slice(0, mid);
    const secondHalf = data.slice(mid);

    // ගණනය කිරීම් සඳහා පොදු ශ්‍රිතයක්
    function calcStats(key) {
        let sum = 0, min = Infinity, max = -Infinity;
        data.forEach(d => {
            const val = Number(d[key]) || 0;
            sum += val;
            if(val < min) min = val;
            if(val > max) max = val;
        });
        const avg = data.length ? (sum / data.length) : 0;

        let fhSum = 0, shSum = 0;
        firstHalf.forEach(d => fhSum += (Number(d[key])||0));
        secondHalf.forEach(d => shSum += (Number(d[key])||0));
        const fhAvg = firstHalf.length ? (fhSum / firstHalf.length) : 0;
        const shAvg = secondHalf.length ? (shSum / secondHalf.length) : 0;

        // Trend එක තීරණය කිරීම (5% ක වෙනසක් සලකා)
        let trend = "Stable ➖";
        let trendColor = "#4B5563";
        if (shAvg > fhAvg * 1.05) { trend = "Increasing 📈"; trendColor = "#0284C7"; }
        else if (shAvg < fhAvg * 0.95) { trend = "Decreasing 📉"; trendColor = "#D97706"; }

        return {
            avg: avg.toFixed(2),
            min: min === Infinity ? "0.00" : min.toFixed(2),
            max: max === -Infinity ? "0.00" : max.toFixed(2),
            trend: trend,
            trendColor: trendColor
        };
    }

    // පරාමිති සියල්ල ගණනය කිරීම
    const stats = {
        ch4: calcStats('ch4'),
        co2: calcStats('co2'),
        h2s: calcStats('h2s'),
        ph: calcStats('ph'),
        pressure: calcStats('pressure'),
        temperature: calcStats('temperature'),
        gasVolume: calcStats('gasVolume')
    };

    return `
        <div style="border-bottom: 2px solid #E5E7EB; padding-bottom: 16px; margin-bottom: 24px;">
            <h3 style="margin: 0; font-size: 20px; color: var(--text-dark);">Historical Trend Analysis</h3>
            <p style="margin: 4px 0 0 0; font-size: 13px; color: var(--text-muted);">Statistical breakdown and overall trend direction of all parameters over the selected period.</p>
        </div>
        
        <div style="overflow-x: auto;">
            <table style="width: 100%; border-collapse: collapse; text-align: left; border: 1px solid #E5E7EB;">
                <thead>
                    <tr style="background: #F8FAFC; border-bottom: 2px solid #E2E8F0;">
                        <th style="padding: 16px; font-size: 13px; color: #475569; font-weight: 700;">PARAMETER</th>
                        <th style="padding: 16px; font-size: 13px; color: #475569; font-weight: 700;">AVERAGE</th>
                        <th style="padding: 16px; font-size: 13px; color: #475569; font-weight: 700;">MINIMUM</th>
                        <th style="padding: 16px; font-size: 13px; color: #475569; font-weight: 700;">MAXIMUM</th>
                        <th style="padding: 16px; font-size: 13px; color: #475569; font-weight: 700;">OVERALL TREND</th>
                    </tr>
                </thead>
                <tbody>
                    <tr style="border-bottom: 1px solid #E5E7EB;">
                        <td style="padding: 16px; font-weight: 600; color: var(--text-dark);">Methane (CH4)</td>
                        <td style="padding: 16px;">${stats.ch4.avg} %</td>
                        <td style="padding: 16px;">${stats.ch4.min} %</td>
                        <td style="padding: 16px;">${stats.ch4.max} %</td>
                        <td style="padding: 16px; color: ${stats.ch4.trendColor}; font-weight: 600;">${stats.ch4.trend}</td>
                    </tr>
                    <tr style="border-bottom: 1px solid #E5E7EB; background: #FAFAFA;">
                        <td style="padding: 16px; font-weight: 600; color: var(--text-dark);">Carbon Dioxide (CO2)</td>
                        <td style="padding: 16px;">${stats.co2.avg} %</td>
                        <td style="padding: 16px;">${stats.co2.min} %</td>
                        <td style="padding: 16px;">${stats.co2.max} %</td>
                        <td style="padding: 16px; color: ${stats.co2.trendColor}; font-weight: 600;">${stats.co2.trend}</td>
                    </tr>
                    <tr style="border-bottom: 1px solid #E5E7EB;">
                        <td style="padding: 16px; font-weight: 600; color: var(--text-dark);">Hydrogen Sulfide (H2S)</td>
                        <td style="padding: 16px;">${stats.h2s.avg} ppm</td>
                        <td style="padding: 16px;">${stats.h2s.min} ppm</td>
                        <td style="padding: 16px;">${stats.h2s.max} ppm</td>
                        <td style="padding: 16px; color: ${stats.h2s.trendColor}; font-weight: 600;">${stats.h2s.trend}</td>
                    </tr>
                    <tr style="border-bottom: 1px solid #E5E7EB; background: #FAFAFA;">
                        <td style="padding: 16px; font-weight: 600; color: var(--text-dark);">pH Level</td>
                        <td style="padding: 16px;">${stats.ph.avg}</td>
                        <td style="padding: 16px;">${stats.ph.min}</td>
                        <td style="padding: 16px;">${stats.ph.max}</td>
                        <td style="padding: 16px; color: ${stats.ph.trendColor}; font-weight: 600;">${stats.ph.trend}</td>
                    </tr>
                    <tr style="border-bottom: 1px solid #E5E7EB;">
                        <td style="padding: 16px; font-weight: 600; color: var(--text-dark);">System Pressure</td>
                        <td style="padding: 16px;">${stats.pressure.avg} bar</td>
                        <td style="padding: 16px;">${stats.pressure.min} bar</td>
                        <td style="padding: 16px;">${stats.pressure.max} bar</td>
                        <td style="padding: 16px; color: ${stats.pressure.trendColor}; font-weight: 600;">${stats.pressure.trend}</td>
                    </tr>
                    <tr style="border-bottom: 1px solid #E5E7EB; background: #FAFAFA;">
                        <td style="padding: 16px; font-weight: 600; color: var(--text-dark);">Temperature</td>
                        <td style="padding: 16px;">${stats.temperature.avg} °C</td>
                        <td style="padding: 16px;">${stats.temperature.min} °C</td>
                        <td style="padding: 16px;">${stats.temperature.max} °C</td>
                        <td style="padding: 16px; color: ${stats.temperature.trendColor}; font-weight: 600;">${stats.temperature.trend}</td>
                    </tr>
                    <tr>
                        <td style="padding: 16px; font-weight: 600; color: var(--text-dark);">Gas Volume</td>
                        <td style="padding: 16px;">${stats.gasVolume.avg} L</td>
                        <td style="padding: 16px;">${stats.gasVolume.min} L</td>
                        <td style="padding: 16px;">${stats.gasVolume.max} L</td>
                        <td style="padding: 16px; color: ${stats.gasVolume.trendColor}; font-weight: 600;">${stats.gasVolume.trend}</td>
                    </tr>
                </tbody>
            </table>
        </div>
    `;
}

// ==========================================
// --- SETTINGS & PREFERENCES LOGIC ---
// ==========================================

function changeTheme(themeValue) {
    if (themeValue === 'dark') {
        document.body.classList.add('dark-theme');
        localStorage.setItem('biogas_theme', 'dark');
    } else if (themeValue === 'light') {
        document.body.classList.remove('dark-theme');
        localStorage.setItem('biogas_theme', 'light');
    } else {
        // System Default
        if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
            document.body.classList.add('dark-theme');
        } else {
            document.body.classList.remove('dark-theme');
        }
        localStorage.setItem('biogas_theme', 'system');
    }
}

function changeLanguage(langCode) {
    // සැබෑ ව්‍යාපෘතියකදී මෙහිදී JSON ෆයිල් එකක් හරහා වචන පරිවර්තනය වීම සිදුවේ.
    const langNames = { en: "English", si: "සිංහල", ta: "தமிழ்" };
    alert(`Language preferences saved: ${langNames[langCode]}.\n(Full translation module will be applied upon system build).`);
    localStorage.setItem('biogas_lang', langCode);
}

// පිටුව load වන විට කලින් save කරපු settings apply කිරීම
window.addEventListener('DOMContentLoaded', () => {
    const savedTheme = localStorage.getItem('biogas_theme');
    if(savedTheme) {
        changeTheme(savedTheme);
        const radio = document.querySelector(`input[name="theme-select"][value="${savedTheme}"]`);
        if(radio) radio.checked = true;
    }
    
    const savedLang = localStorage.getItem('biogas_lang');
    if(savedLang) {
        const select = document.getElementById('language-select');
        if(select) select.value = savedLang;
    }
});

// ==========================================
// --- SENSOR STATUS MODULE ---
// ==========================================

async function loadSensorStatus() {
    const container = document.getElementById('sensor-status-container');
    if (!container) return;

    let targetUnitId = globalSelectedUnitId; // 🔴 වෙනස් කළ ස්ථානය

    if (!targetUnitId) {
        container.innerHTML = "<p style='color:red;'>Please select a Biogas Unit from the dropdown.</p>";
        return;
    }

    try {
        // Firebase වෙතින් අවසන් දත්තය (Latest reading) පමණක් ලබා ගැනීම
        const dbQuery = window.query(
            window.dbRef(window.firebaseDB, `sensor_logs/${targetUnitId}`),
            window.orderByKey(),
            window.limitToLast(1)
        );
        
        const snapshot = await window.dbGet(dbQuery);
        if (!snapshot.exists()) {
            container.innerHTML = "<p>No sensor data available yet.</p>";
            return;
        }

        const dataObj = snapshot.val();
        const latestKey = Object.keys(dataObj)[0];
        const log = dataObj[latestKey];

        // Connection Status පරීක්ෂා කිරීම (අවසන් දත්තය විනාඩි 10කට වඩා පරණ නම් Offline ලෙස සලකයි)
        const lastTime = new Date(log.timestamp).getTime();
        const now = new Date().getTime();
        const isOnline = (now - lastTime) < (10 * 60 * 1000); 
        
        const connectionBadge = isOnline ?
            `<span style="background: #DCFCE7; color: #166534; padding: 4px 8px; border-radius: 4px; font-size: 10px; font-weight: 700; letter-spacing: 0.5px;">🟢 ONLINE</span>` :
            `<span style="background: #FEE2E2; color: #991B1B; padding: 4px 8px; border-radius: 4px; font-size: 10px; font-weight: 700; letter-spacing: 0.5px;">🔴 OFFLINE</span>`;

        // සෙන්සර් පරාමිතීන් සහ Safe Ranges නිර්වචනය කිරීම
        const sensors = [
            { id: 'ch4', name: 'Methane (CH4) Sensor', param: 'Gas Quality', value: Number(log.ch4||0).toFixed(1), unit: '%', safeRange: '50.0 - 70.0 %', isCritical: (log.ch4 < 40) },
            { id: 'h2s', name: 'Hydrogen Sulfide (H2S) Sensor', param: 'Toxic Gas Level', value: Number(log.h2s||0).toFixed(2), unit: 'ppm', safeRange: '< 1.50 ppm', isCritical: (log.h2s > 1.8) },
            { id: 'pressure', name: 'Pressure Sensor', param: 'System Pressure', value: Number(log.pressure||0).toFixed(2), unit: 'bar', safeRange: '1.00 - 1.20 bar', isCritical: (log.pressure > 1.3) },
            { id: 'ph', name: 'Digester pH Sensor', param: 'Acidity Level', value: Number(log.ph||0).toFixed(2), unit: '', safeRange: '6.50 - 7.50', isCritical: (log.ph < 6.0 || log.ph > 8.0) },
            { id: 'temperature', name: 'Temperature Sensor', param: 'Process Heat', value: Number(log.temperature||0).toFixed(1), unit: '°C', safeRange: '30.0 - 40.0 °C', isCritical: (log.temperature > 45.0) }
        ];

        let html = '';
        sensors.forEach(s => {
            let status = "NORMAL";
            let statusColor = "#166534"; // Green
            let statusBg = "#DCFCE7";
            let alertMsg = "";

            if (!isOnline) {
                status = "OFFLINE"; statusColor = "#4B5563"; statusBg = "#F3F4F6";
            } else if (s.isCritical) {
                status = "CRITICAL"; statusColor = "#991B1B"; statusBg = "#FEE2E2";
                alertMsg = "⚠️ Out of safe bounds!";
            }

            html += `
                <div class="param-card" style="border: 1px solid ${s.isCritical && isOnline ? '#FCA5A5' : '#E5E7EB'}; background: ${s.isCritical && isOnline ? '#FEF2F2' : 'var(--bg-primary)'}; padding: 20px; border-radius: 12px; display: flex; flex-direction: column; justify-content: space-between;">
                    <div>
                        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px;">
                            <div>
                                <h4 style="margin: 0 0 4px 0; font-size: 16px; color: var(--text-dark); font-weight: 600;">${s.name}</h4>
                                <p style="margin: 0; font-size: 11px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px;">${s.param}</p>
                            </div>
                            ${connectionBadge}
                        </div>
                        
                        <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                            <span style="font-size: 13px; color: var(--text-muted);">Current Value:</span>
                            <span style="font-size: 16px; font-weight: 700; color: ${statusColor};">${s.value} ${s.unit}</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; margin-bottom: 16px; border-bottom: 1px solid #F3F4F6; padding-bottom: 8px;">
                            <span style="font-size: 12px; color: var(--text-muted);">Safe Range:</span>
                            <span style="font-size: 12px; font-weight: 600; color: var(--text-dark);">${s.safeRange}</span>
                        </div>
                    </div>

                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <div>
                            <span style="background: ${statusBg}; color: ${statusColor}; padding: 6px 12px; border-radius: 20px; font-size: 11px; font-weight: 700;">${status}</span>
                            <span style="font-size: 11px; color: #991B1B; margin-left: 8px; font-weight: 600;">${alertMsg}</span>
                        </div>
                        <button class="btn-secondary-small" onclick="reportSpecificSensor('${s.name}', '${s.value} ${s.unit}', '${status}')" style="font-size: 12px; padding: 6px 12px; border: 1px solid #FCA5A5; color: #991B1B; background: #FFFFFF; cursor: pointer; transition: 0.2s;">⚠️ Report Issue</button>
                    </div>
                </div>
            `;
        });
        container.innerHTML = html;

    } catch (error) {
        console.error("Error loading sensors:", error);
        container.innerHTML = "<p style='color:red;'>Failed to load sensor data.</p>";
    }
}

// අදාළ Sensor එක Mention කරමින් Complaint Center එකට යාම
function reportSpecificSensor(sensorName, currentValue, status) {
    switchCustomerTab('cust-support');
    
    const chatInput = document.getElementById('cust-chat-input');
    if(chatInput) {
        const mentionTag = `[⚠️ Issue: ${sensorName}] Status: ${status} | Current Value: ${currentValue}. Please assist! `;
        chatInput.value = mentionTag;
        chatInput.focus();
    }
}

// ==========================================
// --- REAL-TIME ALERTS & NOTIFICATIONS ---
// ==========================================

// 1. Request Desktop Notification Permission on load
document.addEventListener('DOMContentLoaded', () => {
    if ("Notification" in window && Notification.permission !== "granted" && Notification.permission !== "denied") {
        Notification.requestPermission();
    }
});

// 2. Global Notification Engine (UPGRADED)
function triggerNotification(title, body, type = 'info', actionCallback = null) {
    // A. Desktop Notification (If browser is minimized or user is on another tab)
    if (document.hidden && "Notification" in window && Notification.permission === "granted") {
        const desktopNotif = new Notification(title, { body: body.replace(/<[^>]*>?/gm, ''), icon: 'https://cdn-icons-png.flaticon.com/512/1008/1008015.png' });
        if (actionCallback) {
            desktopNotif.onclick = () => {
                window.focus();
                actionCallback();
            };
        }
    } else if ("Notification" in window && Notification.permission !== "granted" && Notification.permission !== "denied") {
        Notification.requestPermission();
    }

    // B. In-App Beautiful Toast Notification (Softly Theme)
    const toast = document.createElement('div');
    let bgColor = type === 'critical' ? '#FEE2E2' : (type === 'chat' ? '#E0F2FE' : '#F3F4F6');
    let borderColor = type === 'critical' ? '#FCA5A5' : (type === 'chat' ? '#BAE6FD' : '#E5E7EB');
    let textColor = type === 'critical' ? '#991B1B' : (type === 'chat' ? '#0369A1' : '#374151');
    let icon = type === 'critical' ? '🚨' : (type === 'chat' ? '💬' : 'ℹ️');

    toast.style.cssText = `
        background: ${bgColor}; color: ${textColor}; border: 1px solid ${borderColor}; 
        padding: 16px; border-radius: 16px; box-shadow: 0 10px 25px rgba(0,0,0,0.15); 
        width: 320px; cursor: pointer; transform: translateX(120%); 
        transition: transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275); 
        display: flex; gap: 12px; align-items: flex-start; z-index: 10000;
    `;
    
    toast.innerHTML = `
        <span style="font-size: 24px;">${icon}</span>
        <div style="flex: 1;">
            <strong style="display: block; font-size: 14px; margin-bottom: 4px;">${title}</strong>
            <span style="font-size: 12px; line-height: 1.4; display: block;">${body}</span>
            ${type === 'critical' ? '<span style="font-size: 10px; font-weight: 700; margin-top: 8px; display: block; color: #7F1D1D;">Click to view Emergency Guide →</span>' : ''}
        </div>
        ${type === 'critical' ? `<button onclick="this.parentElement.style.transform='translateX(120%)'; setTimeout(() => this.parentElement.remove(), 400); event.stopPropagation();" style="background:none;border:none;font-size:16px;cursor:pointer;color:#991B1B;">✖</button>` : ''}
    `;
    
    toast.onclick = (e) => {
        if(actionCallback) actionCallback();
        toast.style.transform = 'translateX(120%)';
        setTimeout(() => toast.remove(), 400);
    };

    document.getElementById('toast-container').appendChild(toast);
    
    // Slide in
    setTimeout(() => toast.style.transform = 'translateX(0)', 50);
    
    // 🔴 FIX: Critical ඒවට විනාඩියක් (60000ms) තියෙනවා ඔයා එනකන්! සාමාන්‍ය ඒවට තත්පර 6යි.
    const displayTime = type === 'critical' ? 60000 : 6000;
    
    setTimeout(() => {
        if(document.body.contains(toast)) {
            toast.style.transform = 'translateX(120%)';
            setTimeout(() => toast.remove(), 400);
        }
    }, displayTime);
}

// 3. User Guide Modal Logic
function openGuideModal(sensorName, value) {
    const modal = document.getElementById('guide-modal');
    const title = document.getElementById('guide-title');
    const content = document.getElementById('guide-content');
    
    title.innerText = `Critical Alert: ${sensorName}`;
    
    let instructions = "";
    if (sensorName.includes("H2S") || sensorName.includes("Hydrogen Sulfide")) {
        instructions = "<ul><li><strong>Evacuate immediately:</strong> Ensure all personnel leave the immediate vicinity.</li><li><strong>Ventilation:</strong> Open all vents and turn on exhaust fans remotely.</li><li><strong>Check Scrubber:</strong> Inspect the desulfurization unit for blockages or depleted media.</li></ul>";
    } else if (sensorName.includes("Pressure")) {
        instructions = "<ul><li><strong>Check Relief Valve:</strong> Ensure the pressure relief valve is functioning immediately.</li><li><strong>Reduce Feed:</strong> Temporarily halt the input of new material to the digester.</li><li><strong>Inspect Pipes:</strong> Look for physical blockages in the gas outlet line.</li></ul>";
    } else if (sensorName.includes("pH")) {
        instructions = "<ul><li><strong>Add Buffer:</strong> Introduce sodium bicarbonate to neutralize acidity.</li><li><strong>Dilution:</strong> Dilute the feedstock with fresh water to stabilize.</li></ul>";
    } else {
        instructions = "<p>Standard safety protocols apply. Turn off main valves and contact maintenance support.</p>";
    }
    
    content.innerHTML = `
        <div style="background: #FEE2E2; padding: 12px; border-radius: 8px; margin-bottom: 16px;">
            <p style="margin: 0; color: #991B1B; font-weight: 600;">Recorded Value: ${value}</p>
        </div>
        <h4 style="margin: 0 0 10px 0; color: var(--text-dark);">Emergency Action Plan:</h4>
        ${instructions}
    `;
    modal.style.display = 'flex';
}

function closeGuideModal() {
    document.getElementById('guide-modal').style.display = 'none';
}

// 4. Initialize Real-time System Listeners (UPGRADED SMART ALERTS)
let lastChatMsgTime = 0;

function initRealtimeListeners() {
    if (!currentUser) return;

    // ----------------------------------------------------
    // 1. CHAT NOTIFICATIONS 
    // ----------------------------------------------------
    const actualWatchUid = currentUser.role === 'customer' ? currentUser.uid : activeChatUid; 
    if (actualWatchUid) {
        const latestChatQuery = window.query(window.dbRef(window.firebaseDB, `chats/${actualWatchUid}/messages`), window.orderByKey(), window.limitToLast(1));
        
        window.dbOnValue(latestChatQuery, (snapshot) => {
            if(!snapshot.exists()) return;
            const data = snapshot.val();
            const key = Object.keys(data)[0];
            const msg = data[key];
            
            const msgTime = new Date(msg.timestamp).getTime();
            if (msgTime > lastChatMsgTime && msg.sender !== currentUser.role) {
                if (lastChatMsgTime !== 0 && (new Date().getTime() - msgTime) < 60000) {
                    const senderName = msg.sender === 'admin' ? 'System Admin' : 'Customer';
                    const previewText = msg.imageUrl ? '📷 Image attached' : (msg.audioUrl ? '🎤 Voice message' : msg.text);
                    
                    triggerNotification(`New Message from ${senderName}`, previewText, 'chat', () => {
                        if(currentUser.role === 'customer') switchCustomerTab('cust-support');
                    });
                }
                lastChatMsgTime = msgTime;
            } else if (lastChatMsgTime === 0) {
                lastChatMsgTime = msgTime; 
            }
        });
    }

    // ----------------------------------------------------
    // 2. SMART SENSOR ALERTS (Live Notifications)
    // ----------------------------------------------------
    if (currentUser.role === 'customer' && typeof globalUnits !== 'undefined') {
        
        if (!window.lastAlertedTimes) window.lastAlertedTimes = {};

        Object.keys(globalUnits).forEach(unitId => {
            const unit = globalUnits[unitId];
            const locId = unit.locationId || unit.location_id;
            const loc = globalLocations[locId] || {};
            
            if (loc.customerId === currentUser.uid) {
                
                const unitName = unit.unitName || unit.name || "Unknown Unit";
                const locName = loc.locationName || loc.name || "Unknown Location";

                if (!window.lastAlertedTimes[unitId]) window.lastAlertedTimes[unitId] = 0;

                // 🔴 FIX: පරණ දත්ත නෙවෙයි, අලුතින්ම එන එක විතරක් ගන්න
                const liveSensorQuery = window.query(
                    window.dbRef(window.firebaseDB, `sensor_logs/${unitId}`),
                    window.orderByKey(),
                    window.limitToLast(1) // අන්තිමට ආපු එක
                );
                
                window.dbOnValue(liveSensorQuery, (snapshot) => {
                    if(!snapshot.exists()) return;
                    
                    const data = snapshot.val();
                    const key = Object.keys(data)[0];
                    const log = data[key];
                    
                    const logTime = new Date(log.timestamp).getTime();
                    const now = new Date().getTime();
                    
                    // 🔴 FIX: Timestamp එක අලුත් එකක් නම් විතරක් Check කරනවා
                    if (logTime > window.lastAlertedTimes[unitId]) {
                        
                        // තත්පර 10කට වඩා අලුත් නම් (පරණ ඒවා පෙන්නන්නේ නැහැ)
                        if ((now - logTime) < 10000 && window.lastAlertedTimes[unitId] !== 0) {
                            
                            let isCritical = false;

                            // Threshold Checks
                            if (Number(log.h2s) > 1.8) {
                                isCritical = true;
                                triggerNotification(
                                    `🚨 Critical Alert: ${unitName}`, 
                                    `Location: ${locName}<br><strong>H2S Level: ${log.h2s} ppm</strong>`, 
                                    'critical', 
                                    () => {
                                        handleUnitSwitch(unitId); 
                                        openGuideModal(`Hydrogen Sulfide (H2S) - ${unitName}`, `${log.h2s} ppm`);
                                    }
                                );
                            }
                            if (Number(log.pressure) > 1.3) {
                                isCritical = true;
                                triggerNotification(
                                    `🚨 Critical Alert: ${unitName}`, 
                                    `Location: ${locName}<br><strong>Pressure: ${log.pressure} bar</strong>`, 
                                    'critical', 
                                    () => {
                                        handleUnitSwitch(unitId); 
                                        openGuideModal(`System Pressure - ${unitName}`, `${log.pressure} bar`);
                                    }
                                );
                            }

                            // Menu අයිකනය රතු කිරීම
                            if (isCritical) {
                                const alertTab = document.getElementById('tab-cust-alerts');
                                if (alertTab && !alertTab.innerHTML.includes('🔴')) {
                                    alertTab.innerHTML += ' <span style="font-size: 10px; animation: floatIcon 1s infinite;">🔴</span>';
                                }
                            }
                        }
                        // අලුත් වෙලාව Save කරගන්නවා
                        window.lastAlertedTimes[unitId] = logTime;
                    }
                });
            }
        });
    }
}

// ==========================================
// --- GLOBAL OVERVIEW & MONITORING LOGIC ---
// ==========================================

let globalSelectedUnitId = null;

function renderCustomerOverview() {
    const container = document.getElementById('customer-overview-container');
    if (!container || !currentUser) return;

    container.innerHTML = "<p style='color: var(--text-muted);'>Loading your Biogas Units from the server...</p>";

    const locRef = window.dbRef(window.firebaseDB, 'locations');
    const unitsRef = window.dbRef(window.firebaseDB, 'units');

    window.dbOnValue(locRef, (locSnapshot) => {
        globalLocations = locSnapshot.exists() ? locSnapshot.val() : {};
        
        window.dbOnValue(unitsRef, (unitSnapshot) => {
            globalUnits = unitSnapshot.exists() ? unitSnapshot.val() : {};
            
            const locationGroups = {};
            let hasUnits = false;

            Object.keys(globalUnits).forEach(uid => {
                const unit = globalUnits[uid];
                const locId = unit.locationId || unit.location_id;
                const loc = globalLocations[locId] || {};
                const actualCustomerId = loc.customerId || unit.customerId;

                if (currentUser.role === 'admin' || actualCustomerId === currentUser.uid) {
                    const locName = loc.name || loc.locationName || loc.location || "University of Kelaniya";
                    const unitName = unit.name || unit.unitName || "Base canteen - Unit 1";
                    const mac = unit.hardwareMac || unit.macAddress || unit.mac || "N/A";

                    if (!locationGroups[locName]) locationGroups[locName] = [];
                    
                    locationGroups[locName].push({ id: uid, safeUnitName: unitName, safeMac: mac, ...unit });
                    hasUnits = true;
                }
            });

            if (!hasUnits) {
                container.innerHTML = "<p style='color: #78716C; font-weight: 500;'>No Biogas Units deployed for your account yet.</p>";
                return;
            }

            let html = '';
            let switcherHtml = '<option value="" disabled>-- Switch Unit --</option>';

            for (const [locName, locUnits] of Object.entries(locationGroups)) {
                switcherHtml += `<optgroup label="📍 ${locName}">`;
                html += `
                    <div class="location-group">
                        <h4 class="location-group-title">📍 Location: ${locName}</h4>
                        <div class="overview-grid">
                `;
                
                locUnits.forEach(u => {
                    switcherHtml += `<option value="${u.id}">${u.safeUnitName}</option>`;
                    const isSelected = globalSelectedUnitId === u.id ? 'selected' : '';
                    html += `
                        <div id="card-${u.id}" class="unit-card ${isSelected}" onclick="selectGlobalUnit('${u.id}', '${u.safeUnitName}', '${locName}')">                            
                            <div style="display: flex; justify-content: space-between; margin-bottom: 12px;">
                                <h3 style="margin: 0; font-size: 16px; color: var(--text-dark);">${u.safeUnitName}</h3>
                                <span style="font-size: 10px; font-weight: 700; padding: 4px 8px; border-radius: 6px; background: #DCFCE7; color: #166534;">ONLINE</span>
                            </div>
                            <p style="margin: 0 0 12px 0; font-size: 12px; color: var(--text-muted);">MAC: <strong style="color: var(--text-dark);">${u.safeMac}</strong></p>
                            <p style="margin: 0; font-size: 13px; color: var(--accent-coral); font-weight: 600;">Click to monitor live data &rarr;</p>
                        </div>
                    `;
                });
                
                switcherHtml += `</optgroup>`;
                html += `</div></div>`;
            }
            container.innerHTML = html;

            // 🔴 FIX: Missing line restored here!
            const dropdownIds = ['monitor-unit-switcher', 'sensor-unit-switcher', 'history-unit-select', 'report-unit-switcher', 'alerts-unit-switcher', 'support-unit-switcher'];
            dropdownIds.forEach(id => {
                const el = document.getElementById(id);
                if (el) {
                    const currentVal = el.value;
                    el.innerHTML = switcherHtml;
                    if (globalSelectedUnitId) {
                        el.value = globalSelectedUnitId;
                    } else if (currentVal) {
                        el.value = currentVal;
                    }
                }
            });
        });
    });
}

function handleUnitSwitch(unitId) {
    if (!unitId || !globalUnits[unitId]) return;
    const unit = globalUnits[unitId];
    const locId = unit.locationId || unit.location_id;
    const loc = globalLocations[locId] || {};
    
    const locName = loc.name || loc.locationName || loc.location || "Unknown Location";
    const unitName = unit.name || unit.unitName || "Unknown Unit";
    
    selectGlobalUnit(unitId, unitName, locName);
}

function selectGlobalUnit(unitId, unitName, locationName) {
    globalSelectedUnitId = unitId;
    currentMonitorUnitId = unitId; 
    
    document.querySelectorAll('.unit-card').forEach(card => card.classList.remove('selected'));
    const selectedCard = document.getElementById('card-' + unitId);
    if (selectedCard) selectedCard.classList.add('selected');
    
    const dropdownIds = ['monitor-unit-switcher', 'sensor-unit-switcher', 'history-unit-select', 'report-unit-switcher', 'alerts-unit-switcher', 'support-unit-switcher'];    
    dropdownIds.forEach(id => {
        const el = document.getElementById(id);
        if (el && el.value !== unitId) el.value = unitId;
    });
    
    const nameEl = document.getElementById('live-unit-name');
    if (nameEl) nameEl.innerText = unitName;
    const locEl = document.getElementById('live-unit-location');
    if (locEl) locEl.innerText = locationName;

    let activeTabId = 'cust-monitor'; 
    const activeTab = document.querySelector('#customer-screen .admin-tab.active');
    if (activeTab) {
        activeTabId = activeTab.id;
    }

    if (activeTabId === 'cust-overview') {
        switchCustomerTab('cust-monitor');
        activeTabId = 'cust-monitor';
    }

    if (activeTabId === 'cust-monitor' && typeof loadMonitorData === 'function') {
        loadMonitorData();
    } else if (activeTabId === 'cust-sensors' && typeof loadSensorStatus === 'function') {
        loadSensorStatus();
    } else if (activeTabId === 'cust-history' && typeof fetchHistoryData === 'function') {
        fetchHistoryData();
    } else if (activeTabId === 'cust-reports') {
        const content = document.getElementById('report-content');
        if (content && content.style.display === 'block') generateReport();
    } else if (activeTabId === 'cust-alerts' && typeof loadCustomerAlerts === 'function') {
        loadCustomerAlerts(); 
    } else if (activeTabId === 'cust-support' && typeof loadCustomerChatForUnit === 'function') {
        loadCustomerChatForUnit(); 
    }
}

function loadMonitorData() {
    if (!globalSelectedUnitId) return;

    if (typeof initLiveChart === 'function') {
        initLiveChart();
    }

    const latestQuery = window.query(
        window.dbRef(window.firebaseDB, `sensor_logs/${globalSelectedUnitId}`),
        window.orderByKey(),
        window.limitToLast(1)
    );

    window.dbGet(latestQuery).then(snapshot => {
        if (snapshot.exists()) {
            const dataObj = snapshot.val();
            const key = Object.keys(dataObj)[0];
            const latestData = dataObj[key];
            if (typeof updateLiveUI === 'function') updateLiveUI(latestData);
        } else {
            if (typeof updateLiveUI === 'function') updateLiveUI({
                ch4: 0, co2: 0, h2s: 0, ph: 0, pressure: 0, temperature: 0, humidity: 0, gasVolume: 0, distance: 300, valve3: 'OFF', pump: 'OFF'
            });
        }
    }).catch(err => console.error("Error loading monitor data:", err));
}

// ==========================================
// --- ADMIN: VIEW UNIT AS CUSTOMER LOGIC ---
// ==========================================

function viewUnitAsAdmin(unitId) {
    // 1. තිරය මාරු කිරීම (Admin -> Customer Dashboard)
    document.getElementById('admin-screen').classList.remove('active');
    document.getElementById('customer-screen').classList.add('active');
    
    // 2. Admin Back බොත්තම පෙන්වීම, සාමාන්‍ය Logout බොත්තම සැඟවීම
    const backBtn = document.getElementById('tab-back-admin');
    const logoutBtn = document.getElementById('customer-logout-btn');
    if (backBtn) backBtn.style.display = 'block';
    if (logoutBtn) logoutBtn.style.display = 'none';

    // 3. Dropdowns සහ Overview එකට Admin ට අදාළව සියලුම Units Load කිරීම
    renderCustomerOverview();

    // 4. තෝරාගත් Unit එකේ දත්ත Load කර Monitor තිරයට යාම
    const unit = globalUnits[unitId];
    if (unit) {
        const locId = unit.locationId || unit.location_id;
        const loc = globalLocations[locId] || {};
        const locName = loc.locationName || loc.name || "Unknown Location";
        const unitName = unit.unitName || unit.name || "Unknown Unit";
        
        selectGlobalUnit(unitId, unitName, locName);
        switchCustomerTab('cust-monitor');
    }
}

function returnToAdmin() {
    // 1. තිරය නැවත Admin වෙත මාරු කිරීම
    document.getElementById('customer-screen').classList.remove('active');
    document.getElementById('admin-screen').classList.add('active');
    
    // 2. Admin Back බොත්තම සැඟවීම, Logout බොත්තම නැවත පෙන්වීම
    const backBtn = document.getElementById('tab-back-admin');
    const logoutBtn = document.getElementById('customer-logout-btn');
    if (backBtn) backBtn.style.display = 'none';
    if (logoutBtn) logoutBtn.style.display = 'flex';
    
    // 3. Admin ගේ Deployments තිරය Active කිරීම
    switchAdminTab('admin-deployments');
    
    // 4. Chart එක සහ Data Listeners අක්‍රිය කිරීම (Background Memory Save කිරීමට)
    if (liveChart) {
        liveChart.destroy();
        liveChart = null;
    }
    currentMonitorUnitId = null;
    globalSelectedUnitId = null;
}

// --- SHARE & COPY FUNCTIONS ---
function copyText(text) {
    if(!text || text === 'undefined') return;
    navigator.clipboard.writeText(text);
    alert('Copied to clipboard: ' + text);
}

function shareCustomerDetails(name, user, pass, loginLink, deviceLink) {
    const shareText = `🌱 *BioGas System Setup*\n\n👤 *Customer:* ${name}\n\n🔗 *Your Secure Login Link:*\n${loginLink}\n\n👤 *Username:* ${user}\n🔑 *Password:* ${pass}\n\n📡 *Device Setup Token:*\n${deviceLink}\n\n_Please do not share these details with anyone._`;
    navigator.clipboard.writeText(shareText);
    alert('All details formatted and copied! Ready to paste in WhatsApp.');
}

function copySuccessDetails() {
    const user = document.getElementById('succ-user').innerText;
    const pass = document.getElementById('succ-pass').innerText;
    const login = document.getElementById('succ-login').innerText;
    const device = document.getElementById('succ-device').innerText;
    shareCustomerDetails('New Customer', user, pass, login, device);
}

// --- ACCESS CONTROL FUNCTION ---
function toggleCustomerAccess(customerId, currentStatus) {
    if (!customerId || customerId === 'undefined') return;
    const newStatus = !currentStatus;
    const action = newStatus ? "GRANT" : "REVOKE";
    
    if(confirm(`Are you sure you want to ${action} login access for this customer?`)) {
        window.dbSet(window.dbRef(window.firebaseDB, `users/${customerId}/accessGranted`), newStatus)
        .then(() => {
            alert(`Customer login access has been ${newStatus ? 'Granted' : 'Revoked'}.`);
        }).catch(err => alert("Error updating access: " + err.message));
    }
}

// --- DELETE UNIT FUNCTION ---
async function deleteUnit(unitId, unitName) {
    if(confirm(`Are you absolutely sure you want to DELETE "${unitName}" and all its data? This action cannot be undone.`)) {
        try {
            // Set data to null to remove it from Firebase
            await window.dbSet(window.dbRef(window.firebaseDB, `units/${unitId}`), null);
            await window.dbSet(window.dbRef(window.firebaseDB, `sensor_logs/${unitId}`), null);
            
            // 🔴 අලුත්: Refresh නොකර ඒ වෙලාවෙම UI එකෙන් කාඩ් එක මකා දැමීම 🔴
            if (globalUnits[unitId]) {
                delete globalUnits[unitId];
            }
            updateDeploymentsUI();
            
            alert("Unit and all its related logs deleted successfully!");
        } catch(error) {
            alert("Error deleting unit: " + error.message);
        }
    }
}

// --- PRO OVERVIEW DASHBOARD LOGIC ---
function updateDashboardStats(unitsData, chatsData, locationsData) {
    let total = 0, online = 0, warning = 0, critical = 0, offline = 0;
    const attentionList = document.getElementById('attention-list-container');
    let attentionHTML = '';

    if (unitsData) {
        Object.entries(unitsData).forEach(([unitId, unit]) => {
            total++;
            
            // 🔴 අලුත්: Critical සහ Warning දෙකම ලිස්ට් එකට ගන්නවා
            if (unit.status === 'offline') {
                offline++;
            } else if (unit.activeAlerts > 0 || unit.status === 'critical' || unit.status === 'warning') {
                
                let isCritical = unit.activeAlerts > 0 || unit.status === 'critical';
                
                if (isCritical) critical++;
                else warning++;

                const loc = locationsData && locationsData[unit.locationId] ? locationsData[unit.locationId] : {};
                const locName = loc.locationName || 'Unknown Location';
                const custId = loc.customerId;
                const custName = globalCustomers[custId] ? globalCustomers[custId].name : 'Customer';
                const custPhone = globalCustomers[custId] ? globalCustomers[custId].phone : '';
                const displayTitle = unit.unitName ? `${locName} - ${unit.unitName}` : locName;
                
                // Warning සහ Critical වලට අදාළව පාට වෙනස් කිරීම
                const borderColor = isCritical ? '#FCA5A5' : '#FDE68A';
                const leftBorder = isCritical ? '#EF4444' : '#F59E0B';
                const titleColor = isCritical ? '#991B1B' : '#D97706';
                const icon = isCritical ? '🚨' : '⚠️';
                
                attentionHTML += `
                    <div style="background: #FFFFFF; border: 1px solid ${borderColor}; border-left: 4px solid ${leftBorder}; border-radius: 8px; padding: 16px; margin-bottom: 12px; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
                        <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                            <div>
                                <div style="font-weight: 700; color: ${titleColor}; font-size: 16px; margin-bottom: 4px;">${icon} ${displayTitle} <span style="color: #64748B; font-weight: normal; font-size: 13px; margin-left: 8px; font-family: monospace;">ID: ${unitId}</span></div>
                                <div style="font-size: 13px; color: #475569; font-weight: 500;">👤 ${custName} | 📞 ${custPhone}</div>
                            </div>
                            <div style="display: flex; gap: 8px;">
                                <button onclick="switchAdminTab('admin-deployments'); document.getElementById('admin-search-input').value='${unitId}'; document.getElementById('admin-search-input').dispatchEvent(new Event('input'));" style="padding: 8px 16px; font-size: 12px; background: #FFFFFF; color: #0F172A; border: 1px solid #CBD5E1; border-radius: 6px; font-weight: 600; cursor: pointer; transition: 0.2s;">View Unit</button>
                                <button onclick="switchAdminTab('admin-complaints'); setTimeout(() => openAdminChat('${unitId}', {name:'${custName}', phone:'${custPhone}'}, '${displayTitle}'), 100);" style="padding: 8px 16px; font-size: 12px; background: #EFF6FF; color: #1D4ED8; border: 1px solid #BFDBFE; border-radius: 6px; font-weight: 600; cursor: pointer; transition: 0.2s;">Customer Chat</button>
                            </div>
                        </div>
                        
                        <div id="issues-${unitId}" style="display: flex; flex-direction: column; gap: 8px; margin-top: 16px; padding-top: 16px; border-top: 1px dashed ${borderColor};">
                            <span style="font-size: 13px; color: ${titleColor};">⏳ Fetching specific alert details...</span>
                        </div>
                    </div>
                `;

                // Live Database එකෙන් අදාළ Unit එකේ අවුල මොකක්ද කියලා අරන් පෙන්නනවා
                window.dbGet(window.query(window.dbRef(window.firebaseDB, `sensor_logs/${unitId}`), window.orderByKey(), window.limitToLast(1))).then(snap => {
                    const issuesContainer = document.getElementById(`issues-${unitId}`);
                    if (snap.exists() && issuesContainer) {
                        const log = Object.values(snap.val())[0];
                        let issues = [];
                        
                        // 🔴 අලුත්: Warning සහ Critical වෙන් කර පෙන්වීම
                        if (log.pressure > 1.3) issues.push(`High System Pressure: ${log.pressure} bar (Critical)`);
                        else if (log.pressure > 1.1) issues.push(`Warning: Pressure is rising (${log.pressure} bar)`);

                        if (log.h2s > 1.8) issues.push(`Toxic Gas Alert: ${log.h2s} ppm (Critical)`);
                        else if (log.h2s > 1.5) issues.push(`Warning: H2S levels rising (${log.h2s} ppm)`);

                        if (log.temperature > 40) issues.push(`High Temperature Detected: ${log.temperature}°C`);
                        if (log.ph < 6.0 || log.ph > 8.0) issues.push(`pH Level Imbalance: ${log.ph}`);
                        
                        if(issues.length > 0) {
                            const issueBg = isCritical ? '#FEE2E2' : '#FEF3C7';
                            const issueText = isCritical ? '#991B1B' : '#D97706';
                            const issueBorder = isCritical ? '#FCA5A5' : '#FDE68A';

                            issuesContainer.innerHTML = issues.map(i => `<div style="background: ${issueBg}; color: ${issueText}; padding: 8px 12px; border-radius: 6px; font-size: 13px; font-weight: 600; border: 1px solid ${issueBorder}; display: inline-block; width: fit-content;">${isCritical ? '🚨' : '⚠️'} ${i}</div>`).join('');
                        } else {
                            issuesContainer.innerHTML = `<span style="color: #475569; font-size: 13px;">Alert triggered, but recent logs show normal values.</span>`;
                        }
                    }
                });

            } else {
                online++;
            }
        });
    }

    let activeComplaintsCount = 0;
    if (chatsData) {
        Object.values(chatsData).forEach(chat => {
            if (chat.status === 'active') activeComplaintsCount++;
        });
    }

    const setVal = (id, val) => { if(document.getElementById(id)) document.getElementById(id).innerText = val; };
    
    setVal('dash-total', total);
    setVal('dash-online', online);
    setVal('dash-warning', warning);
    setVal('dash-critical', critical);
    setVal('dash-complaints', activeComplaintsCount);

    setVal('stat-norm', online);
    setVal('stat-warn', warning);
    setVal('stat-crit', critical);
    setVal('stat-off', offline);

    if (attentionList) {
        if (attentionHTML !== '') {
            attentionList.innerHTML = attentionHTML;
        } else {
            attentionList.innerHTML = `<div style="text-align: center; padding: 20px; color: #64748B; font-size: 14px; background: #F8FAFC; border-radius: 8px;">✅ No critical alerts at the moment. System is stable.</div>`;
        }
    }
}

// --- START LIVE DASHBOARD SYNC (Fixed Memory Leak) ---
// --- START LIVE DASHBOARD SYNC (Fixed Database Listener) ---
function startDashboardLiveUpdates() {
    const db = window.firebaseDB;
    
    let liveUnits = null;
    let liveChats = null;
    let liveLocations = null;

    const triggerUpdate = () => {
        if(liveUnits !== null && liveLocations !== null) {
            updateDashboardStats(liveUnits, liveChats, liveLocations);
        }
    };

    // ඔයාගේ index.html එකට ගැළපෙන්න window.dbOnValue භාවිතා කිරීම
    window.dbOnValue(window.dbRef(db, 'units'), (snap) => { liveUnits = snap.val() || {}; triggerUpdate(); });
    window.dbOnValue(window.dbRef(db, 'chats'), (snap) => { liveChats = snap.val() || {}; triggerUpdate(); });
    window.dbOnValue(window.dbRef(db, 'locations'), (snap) => { liveLocations = snap.val() || {}; triggerUpdate(); });
}

// --- CLEAR ALL ALERTS FUNCTION ---
async function clearAllAlerts() {
    if(confirm("Are you sure you want to clear all active alerts from the system?")) {
        try {
            const snapshot = await window.dbGet(window.dbRef(window.firebaseDB, 'units'));
            if(snapshot.exists()) {
                const updates = {};
                Object.keys(snapshot.val()).forEach(unitId => {
                    updates[`units/${unitId}/activeAlerts`] = 0;
                    updates[`units/${unitId}/status`] = 'active'; // Reset status to normal
                });
                await window.dbUpdate(window.dbRef(window.firebaseDB), updates);
            }
        } catch(e) {
            alert("Failed to clear alerts: " + e.message);
        }
    }
}

// ==========================================
// --- ADMIN: CUSTOMER MANAGEMENT LOGIC ---
// ==========================================

// ==========================================
// --- ADMIN: CUSTOMER MANAGEMENT LOGIC ---
// ==========================================

function renderCustomersList() {
    const container = document.getElementById('customers-list-container');
    if(!container) return;
    container.innerHTML = '';

    const customerKeys = Object.keys(globalCustomers);
    if(customerKeys.length === 0) {
        container.innerHTML = '<div style="text-align: center; padding: 40px; background: #FFFFFF; border-radius: 12px; border: 1px solid #E2E8F0; color: #64748B;">No customers registered yet.</div>';
        return;
    }

    customerKeys.forEach(custId => {
        const cust = globalCustomers[custId];
        
        let locHTML = '';
        Object.entries(globalLocations).forEach(([locId, loc]) => {
            if (loc.customerId === custId) {
                // 🔴 Location Edit Button එකතු කර ඇත
                locHTML += `
                    <div style="margin-top: 12px; padding: 16px; background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; position: relative;">
                        <button onclick="openEditLocationModal('${locId}')" style="position: absolute; right: 16px; top: 16px; background: #FFFFFF; border: 1px solid #CBD5E1; color: #475569; padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: 600; cursor: pointer; transition: 0.2s;">✏️ Edit</button>
                        
                        <strong style="color: #0F172A; font-size: 14px;">📍 ${loc.locationName || 'Location'}</strong><br>
                        <span style="font-size: 12px; color: #64748B;">${loc.address || 'No address provided'}</span>
                        <ul style="margin-top: 12px; padding-left: 20px; font-size: 13px; color: #475569; list-style-type: square;">`;
                
                let hasUnits = false;
                Object.entries(globalUnits).forEach(([unitId, unit]) => {
                    if (unit.locationId === locId) {
                        hasUnits = true;
                        locHTML += `<li style="margin-bottom: 4px;"><strong style="color: #0F172A;">${unit.unitName || 'Unit'}</strong> - Token: <span style="font-family: monospace; color: #0284C7; background: #E0F2FE; padding: 2px 6px; border-radius: 4px; font-size: 11px;">${unit.unitToken}</span></li>`;
                    }
                });
                
                if (!hasUnits) locHTML += `<li style="color: #94A3B8; list-style: none; margin-left: -20px;">No units assigned yet</li>`;
                locHTML += `</ul></div>`;
            }
        });

        if (locHTML === '') locHTML = '<p style="font-size: 13px; color: #94A3B8; margin-top: 8px; padding: 12px; background: #F8FAFC; border-radius: 8px; border: 1px dashed #CBD5E1;">No locations or units assigned to this customer yet.</p>';

        const safeName = cust.name || 'Unknown Customer';
        const safeEmail = cust.email || 'N/A';
        const safePhone = cust.phone || 'N/A';

        const card = document.createElement('div');
        card.style.cssText = "background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 12px; padding: 24px; box-shadow: 0 2px 4px rgba(0,0,0,0.02);";
        
        // 🔴 Customer Profile Edit Button එකතු කර ඇත
        card.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; flex-wrap: wrap; gap: 12px;">
                <div style="display: flex; gap: 16px; align-items: center;">
                    <div style="width: 48px; height: 48px; background: #EFF6FF; color: #1D4ED8; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 24px;">👤</div>
                    <div>
                        <h3 style="margin: 0 0 4px 0; font-size: 18px; color: #0F172A; font-weight: 700;">${safeName}</h3>
                        <p style="margin: 0; font-size: 13px; color: #475569; font-weight: 500;">📧 ${safeEmail} <span style="color: #CBD5E1; margin: 0 8px;">|</span> 📞 ${safePhone}</p>
                    </div>
                </div>
                <div style="display: flex; gap: 8px;">
                    <button onclick="openEditCustomerModal('${custId}')" style="padding: 8px 16px; font-size: 13px; background: #FFFFFF; color: #0F172A; border: 1px solid #CBD5E1; border-radius: 6px; font-weight: 600; cursor: pointer; transition: 0.2s;">✏️ Edit Profile</button>
                    <button onclick="deleteCustomerRecord('${custId}', '${safeName}')" style="padding: 8px 16px; font-size: 13px; background: #FEF2F2; color: #DC2626; border: 1px solid #FECACA; border-radius: 6px; font-weight: 600; cursor: pointer; transition: 0.2s;">🗑️ Delete</button>
                </div>
            </div>
            
            <div style="border-top: 1px solid #F1F5F9; padding-top: 16px;">
                <h4 style="font-size: 14px; color: #64748B; margin: 0 0 8px 0; text-transform: uppercase; letter-spacing: 0.5px;">Assigned Deployments</h4>
                ${locHTML}
            </div>
        `;
        container.appendChild(card);
    });
}

// ==========================================
// --- EDIT MODAL LOGIC (CUSTOMERS & LOCATIONS) ---
// ==========================================

// Customer Edit
function openEditCustomerModal(custId) {
    const cust = globalCustomers[custId];
    if(!cust) return;
    document.getElementById('edit-cust-id').value = custId;
    document.getElementById('edit-cust-name').value = cust.name || '';
    document.getElementById('edit-cust-phone').value = cust.phone || '';
    document.getElementById('edit-customer-modal').classList.add('active');
}

function closeEditCustomerModal() {
    document.getElementById('edit-customer-modal').classList.remove('active');
}

async function saveCustomerEdit() {
    const custId = document.getElementById('edit-cust-id').value;
    const newName = document.getElementById('edit-cust-name').value.trim();
    const newPhone = document.getElementById('edit-cust-phone').value.trim();
    
    if(!newName || !newPhone) return alert("Name and Phone number cannot be empty!");
    
    try {
        await window.dbUpdate(window.dbRef(window.firebaseDB, `users/${custId}`), {
            name: newName,
            phone: newPhone
        });
        
        globalCustomers[custId].name = newName;
        globalCustomers[custId].phone = newPhone;
        
        closeEditCustomerModal();
        renderCustomersList();
        updateDeploymentsUI(); // Deployments tab එකත් ඉබේම අලුත් වෙන්න
        
    } catch(e) { alert("Error updating customer: " + e.message); }
}

// Location Edit
function openEditLocationModal(locId) {
    const loc = globalLocations[locId];
    if(!loc) return;
    document.getElementById('edit-loc-id').value = locId;
    document.getElementById('edit-loc-name').value = loc.locationName || '';
    document.getElementById('edit-loc-address').value = loc.address || '';
    document.getElementById('edit-location-modal').classList.add('active');
}

function closeEditLocationModal() {
    document.getElementById('edit-location-modal').classList.remove('active');
}

async function saveLocationEdit() {
    const locId = document.getElementById('edit-loc-id').value;
    const newLocName = document.getElementById('edit-loc-name').value.trim();
    const newAddress = document.getElementById('edit-loc-address').value.trim();
    
    if(!newLocName) return alert("Location Name cannot be empty!");
    
    try {
        await window.dbUpdate(window.dbRef(window.firebaseDB, `locations/${locId}`), {
            locationName: newLocName,
            address: newAddress
        });
        
        globalLocations[locId].locationName = newLocName;
        globalLocations[locId].address = newAddress;
        
        closeEditLocationModal();
        renderCustomersList();
        updateDeploymentsUI(); // Deployments tab එකත් ඉබේම අලුත් වෙන්න
        
    } catch(e) { alert("Error updating location: " + e.message); }
}

// Function to delete a customer and ALL their associated data
async function deleteCustomerRecord(custId, custName) {
    if(confirm(`⚠️ CRITICAL WARNING: Are you sure you want to completely DELETE the customer "${custName}"?\n\nThis will permanently delete their account AND all their assigned locations, biogas units, sensor logs, and chat histories. This action CANNOT be undone.`)) {
        try {
            const db = window.firebaseDB;
            const updates = {}; // එකපාර දත්ත ගොඩක් මකන්න අපි මේක පාවිච්චි කරනවා
            
            // 1. අදාළ Customer ගේ Locations සහ Units හොයාගෙන මකා දැමීම
            Object.entries(globalLocations).forEach(([locId, loc]) => {
                if (loc.customerId === custId) {
                    
                    // ඒ Location එකට අයිති Units මකා දැමීම
                    Object.entries(globalUnits).forEach(([unitId, unit]) => {
                        if (unit.locationId === locId) {
                            updates[`units/${unitId}`] = null;
                            updates[`sensor_logs/${unitId}`] = null;
                            updates[`chats/${unitId}`] = null;
                            
                            delete globalUnits[unitId]; // Local මතකයෙන් ඉවත් කිරීම
                        }
                    });
                    
                    // Location එක මකා දැමීම
                    updates[`locations/${locId}`] = null;
                    delete globalLocations[locId]; // Local මතකයෙන් ඉවත් කිරීම
                }
            });

            // 2. Customer ගිණුම මකා දැමීම
            updates[`users/${custId}`] = null;
            delete globalCustomers[custId]; // Local මතකයෙන් ඉවත් කිරීම

            // 3. Database එකට Update එක යැවීම (එකපාර ඔක්කොම මැකී යයි)
            await window.dbUpdate(window.dbRef(db), updates);
            
            alert(`Customer "${custName}" and all associated data deleted successfully!`);
            
            // 4. කිසිම Refresh කිරීමකින් තොරව UI එක අලුත් කිරීම
            renderCustomersList(); 
            updateDeploymentsUI(); // Deployments tab එකෙනුත් ඉබේම මැකී යයි
            
            // Overview එකේ ගණන් (Counts) හරිගැස්සීම
            const totalUnitsEl = document.getElementById('admin-total-units');
            if (totalUnitsEl) totalUnitsEl.innerText = Object.keys(globalUnits).length;
            
        } catch(error) {
            alert("Error deleting customer and data: " + error.message);
        }
    }
}