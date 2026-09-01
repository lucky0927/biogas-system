let sensorChart; 
const maxDataPoints = 8; 

function switchScreen(screenId) {
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
    });
    document.getElementById(screenId).classList.add('active');

    if(screenId === 'dashboard-screen') {
        document.getElementById('main-nav').style.display = 'none';
        switchSubScreen('monitor-content', 'side-mon');
    } else {
        document.getElementById('main-nav').style.display = 'flex';
    }
}

function switchSubScreen(subContentId, sideBtnId) {
    document.querySelectorAll('.sub-screen').forEach(sub => {
        sub.classList.remove('sub-active');
    });
    document.querySelectorAll('.sidebar ul li').forEach(li => {
        li.classList.remove('active-link');
    });

    document.getElementById(subContentId).classList.add('sub-active');
    document.getElementById(sideBtnId).classList.add('active-link');
    
    if(subContentId === 'monitor-content' && sensorChart) {
        sensorChart.resize();
    }
}

function restrictedAccess() {
    alert("Please login first to access this section!");
    switchScreen('login-screen');
}

function handleLogin() {
    const usernameInput = document.getElementById('username').value;
    if(usernameInput.trim() === "") {
        alert("Please enter a valid Username!");
        return;
    }
    document.getElementById('welcome-text').innerText = `Welcome back, ${usernameInput}!`;
    switchScreen('dashboard-screen');
    
    initChart();
    connectToRealtimeData(); 
}

function handleLogout() {
    document.getElementById('username').value = "";
    document.getElementById('password').value = "";
    document.getElementById('historyLogBody').innerHTML = ''; // වගුව හිස් කිරීම
    switchScreen('home-screen');
}

function initChart() {
    const ctx = document.getElementById('liveSensorChart').getContext('2d');
    if(sensorChart) { sensorChart.destroy(); }

    sensorChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [], 
            datasets: [
                { label: 'CH4 %', data: [], borderColor: '#2e7d32', backgroundColor: 'rgba(46, 125, 50, 0.1)', borderWidth: 2, tension: 0.3, fill: true },
                { label: 'CO2 %', data: [], borderColor: '#1565c0', backgroundColor: 'rgba(21, 101, 192, 0.1)', borderWidth: 2, tension: 0.3, fill: true },
                { label: 'H2S ppm', data: [], borderColor: '#e65100', backgroundColor: 'rgba(230, 81, 0, 0.1)', borderWidth: 2, tension: 0.3, fill: true }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false, 
        }
    });
}

function connectToRealtimeData() {
    const socket = io('https://biogas-system-jh34.onrender.com');

    socket.on('connect', () => {
        console.log('✅ Connected to Real-time Backend Stream');
    });

    socket.on('liveData', (data) => {
        const isDashboardActive = document.getElementById('dashboard-screen').classList.contains('active');
        
        if(isDashboardActive) {
            
            document.getElementById('val-ch4').innerHTML = `${data.ch4} <span class="sensor-unit">%</span>`;
            document.getElementById('val-co2').innerHTML = `${data.co2} <span class="sensor-unit">%</span>`;
            document.getElementById('val-h2s').innerHTML = `${data.h2s} <span class="sensor-unit">ppm</span>`;
            document.getElementById('val-ph').innerHTML = data.ph;
            document.getElementById('val-press').innerHTML = `${data.pressure} <span class="sensor-unit">bar</span>`;

            const now = new Date();
            const timeStamp = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;

            
            if(sensorChart) {
                sensorChart.data.labels.push(timeStamp);
                sensorChart.data.datasets[0].data.push(data.ch4);
                sensorChart.data.datasets[1].data.push(data.co2);
                sensorChart.data.datasets[2].data.push(data.h2s);

                if(sensorChart.data.labels.length > maxDataPoints) {
                    sensorChart.data.labels.shift();
                    sensorChart.data.datasets.forEach(d => d.data.shift());
                }
                sensorChart.update();
            }

            
            const tbody = document.getElementById('historyLogBody');
            const newRow = `
                <tr>
                    <td><strong>${timeStamp}</strong></td>
                    <td>${data.ch4} %</td>
                    <td>${data.co2} %</td>
                    <td>${data.h2s} ppm</td>
                    <td>${data.ph}</td>
                    <td>${data.pressure} bar</td>
                </tr>
            `;
            tbody.insertAdjacentHTML('afterbegin', newRow);
        }
    });
}