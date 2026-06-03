// ==================== DATA STRUCTURES ====================
const TRANSPORT_MODES = {
    train: { color: '#33E339', speed: 120, cost: 500 },
    bus: { color: '#A83BE8', speed: 80, cost: 100 },
    airplane: { color: '#000000', speed: 800, cost: 1000 }
};

let pinpoints = JSON.parse(localStorage.getItem('pinpoints')) || [];
let connections = JSON.parse(localStorage.getItem('connections')) || [];
let nextPinpointId = parseInt(localStorage.getItem('nextPinpointId')) || 1;

// Map state
let scale = 1;
let translateX = 0;
let translateY = 0;
let isDragging = false;
let startX = 0;
let startY = 0;

// Connection state
let connectingFrom = null;
let modalPinpointPos = null;
let selectedLine = null;

// ==================== INITIALIZATION ====================
document.addEventListener('DOMContentLoaded', () => {
    loadIndonesiaMap();
    setupEventListeners();
});

// ==================== MAP LOADING ====================
function loadIndonesiaMap() {
    fetch('indonesia.svg')
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.text();
        })
        .then(data => {
            const parser = new DOMParser();
            const svgDoc = parser.parseFromString(data, 'image/svg+xml');
            const svgElement = svgDoc.documentElement;
            
            const mapSvg = document.getElementById('mapSvg');
            
            // Set viewBox and attributes of mapSvg
            const viewBox = svgElement.getAttribute('viewBox') || '0 0 854 385';
            mapSvg.setAttribute('viewBox', viewBox);
            
            // Extract width/height from viewBox
            const viewBoxValues = viewBox.trim().split(/[\s,]+/).map(Number);
            window.mapWidth = viewBoxValues[2] || 854;
            window.mapHeight = viewBoxValues[3] || 385;
            
            // Set wrapper and SVG dimensions to match the SVG viewBox
            const wrapper = document.getElementById('mapWrapper');
            if (wrapper) {
                wrapper.style.width = window.mapWidth + 'px';
                wrapper.style.height = window.mapHeight + 'px';
            }
            
            // Set mapSvg innerHTML to svgElement's innerHTML
            mapSvg.innerHTML = svgElement.innerHTML;
            
            // Fit map to screen, and render items
            fitMapToScreen();
            renderPinpoints();
            renderConnections();
        })
        .catch(error => {
            console.error('Error loading SVG map:', error);
            // Fallback to a placeholder style so it doesn't crash completely
            window.mapWidth = 1000;
            window.mapHeight = 500;
            const wrapper = document.getElementById('mapWrapper');
            if (wrapper) {
                wrapper.style.width = window.mapWidth + 'px';
                wrapper.style.height = window.mapHeight + 'px';
            }
            fitMapToScreen();
        });
}

function getMinScale() {
    const container = document.getElementById('mapContainer');
    if (!container) return 0.5;
    const w = window.mapWidth || 854;
    const h = window.mapHeight || 385;
    return Math.max(container.clientWidth / w, container.clientHeight / h);
}

function fitMapToScreen() {
    const container = document.getElementById('mapContainer');
    if (!container) return;
    
    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;
    
    const w = window.mapWidth || 854;
    const h = window.mapHeight || 385;
    
    // Calculate scale to fit (cover style)
    const scaleX = containerWidth / w;
    const scaleY = containerHeight / h;
    scale = Math.max(scaleX, scaleY);
    
    // Center the map
    translateX = (containerWidth - w * scale) / 2;
    translateY = (containerHeight - h * scale) / 2;
    
    updateMapTransform();
}

function clampTransform() {
    const container = document.getElementById('mapContainer');
    if (!container) return;
    
    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;
    
    const w = window.mapWidth || 854;
    const h = window.mapHeight || 385;
    
    // 1. Clamp scale to ensure it covers the viewport
    const minScale = getMinScale();
    if (scale < minScale) {
        scale = minScale;
    }
    
    // 2. Clamp translations
    const maxTranslateX = 0;
    const minTranslateX = containerWidth - w * scale;
    translateX = Math.min(maxTranslateX, Math.max(minTranslateX, translateX));
    
    const maxTranslateY = 0;
    const minTranslateY = containerHeight - h * scale;
    translateY = Math.min(maxTranslateY, Math.max(minTranslateY, translateY));
}

function updateMapTransform() {
    clampTransform();
    const wrapper = document.getElementById('mapWrapper');
    if (wrapper) {
        wrapper.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;
        wrapper.style.transformOrigin = '0 0';
    }
}

// ==================== EVENT LISTENERS ====================
function setupEventListeners() {
    const mapContainer = document.getElementById('mapContainer');
    const wrapper = document.getElementById('mapWrapper');
    
    // Double click to add pinpoint
    mapContainer.addEventListener('dblclick', handleDoubleClick);
    
    // Pan functionality
    wrapper.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    
    // Zoom functionality
    mapContainer.addEventListener('wheel', handleWheel, { passive: false });
    document.addEventListener('keydown', handleKeyDown);
    
    // Handle window resize
    window.addEventListener('resize', () => {
        fitMapToScreen();
    });
    
    // Find route inputs
    document.getElementById('fromInput').addEventListener('input', validateRouteInputs);
    document.getElementById('toInput').addEventListener('input', validateRouteInputs);
    document.getElementById('searchBtn').addEventListener('click', findRoutes);
    
    // Sort buttons
    document.querySelectorAll('.sort-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.sort-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            if (document.getElementById('routeResults').children.length > 0) {
                findRoutes();
            }
        });
    });
    
    // Delete connection with keyboard
    document.addEventListener('keydown', (e) => {
        if ((e.key === 'Delete' || e.key === 'Backspace') && selectedLine) {
            deleteConnection(selectedLine);
            selectedLine = null;
        }
    });
}

function handleDoubleClick(e) {
    if (e.target.closest('.pinpoint') || e.target.closest('.modal')) return;
    
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left - translateX) / scale;
    const y = (e.clientY - rect.top - translateY) / scale;
    
    modalPinpointPos = { x, y };
    showAddPinpointModal();
}

function handleMouseDown(e) {
    if (e.target.closest('.pinpoint') || e.target.closest('.connection-line')) return;
    
    isDragging = true;
    startX = e.clientX - translateX;
    startY = e.clientY - translateY;
    e.currentTarget.classList.add('grabbing');
}

function handleMouseMove(e) {
    if (!isDragging) return;
    
    translateX = e.clientX - startX;
    translateY = e.clientY - startY;
    updateMapTransform();
}

function handleMouseUp(e) {
    isDragging = false;
    document.getElementById('mapWrapper').classList.remove('grabbing');
}

function handleWheel(e) {
    if (!e.ctrlKey) return;
    
    e.preventDefault();
    
    const rect = e.currentTarget.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    const minScale = getMinScale();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const newScale = Math.max(minScale, Math.min(5, scale * delta));
    
    // Zoom towards mouse position
    const scaleChange = newScale / scale;
    translateX = mouseX - (mouseX - translateX) * scaleChange;
    translateY = mouseY - (mouseY - translateY) * scaleChange;
    
    scale = newScale;
    updateMapTransform();
}

function handleKeyDown(e) {
    if (!e.ctrlKey) return;
    
    if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        zoomIn();
    } else if (e.key === '-' || e.key === '_') {
        e.preventDefault();
        zoomOut();
    }
}

function zoomIn() {
    const container = document.getElementById('mapContainer');
    const centerX = container.clientWidth / 2;
    const centerY = container.clientHeight / 2;
    
    const newScale = Math.min(5, scale * 1.1);
    const scaleChange = newScale / scale;
    
    translateX = centerX - (centerX - translateX) * scaleChange;
    translateY = centerY - (centerY - translateY) * scaleChange;
    
    scale = newScale;
    updateMapTransform();
}

function zoomOut() {
    const container = document.getElementById('mapContainer');
    const centerX = container.clientWidth / 2;
    const centerY = container.clientHeight / 2;
    
    const minScale = getMinScale();
    const newScale = Math.max(minScale, scale * 0.9);
    const scaleChange = newScale / scale;
    
    translateX = centerX - (centerX - translateX) * scaleChange;
    translateY = centerY - (centerY - translateY) * scaleChange;
    
    scale = newScale;
    updateMapTransform();
}

// ==================== PINPOINT MANAGEMENT ====================
function showAddPinpointModal() {
    document.getElementById('addPinpointModal').style.display = 'flex';
    document.getElementById('pinpointNameInput').value = '';
    document.getElementById('pinpointNameInput').focus();
    
    document.getElementById('pinpointNameInput').onkeypress = (e) => {
        if (e.key === 'Enter') submitPinpoint();
    };
}

function closeAddPinpointModal() {
    document.getElementById('addPinpointModal').style.display = 'none';
    modalPinpointPos = null;
}

function submitPinpoint() {
    const name = document.getElementById('pinpointNameInput').value.trim();
    if (!name) return;
    
    const pinpoint = {
        id: nextPinpointId++,
        name: name,
        x: modalPinpointPos.x,
        y: modalPinpointPos.y
    };
    
    pinpoints.push(pinpoint);
    savePinpoints();
    renderPinpoints();
    closeAddPinpointModal();
}

function renderPinpoints() {
    const layer = document.getElementById('pinpointsLayer');
    layer.innerHTML = '';
    
    pinpoints.forEach(pinpoint => {
        const div = document.createElement('div');
        div.className = 'pinpoint';
        div.style.left = pinpoint.x + 'px';
        div.style.top = pinpoint.y + 'px';
        div.dataset.id = pinpoint.id;
        
        const isConnecting = connectingFrom && connectingFrom.id === pinpoint.id;
        
        div.innerHTML = `
            <div class="pinpoint-label ${isConnecting ? 'connecting' : ''}">
                <span class="pinpoint-name">${pinpoint.name}</span>
                <button class="pinpoint-btn" onclick="startConnection(${pinpoint.id}, event)" title="Connect">⇄</button>
                <button class="pinpoint-btn" onclick="deletePinpoint(${pinpoint.id}, event)" title="Delete">🗑</button>
            </div>
            <div class="pinpoint-icon">📍</div>
        `;
        
        // Click handler for connecting
        if (connectingFrom && connectingFrom.id !== pinpoint.id) {
            div.style.cursor = 'pointer';
            div.addEventListener('click', (e) => {
                if (e.target.closest('.pinpoint-btn')) return;
                showConnectModal(pinpoint);
            });
        }
        
        layer.appendChild(div);
    });
}

function startConnection(pinpointId, event) {
    if (event) event.stopPropagation();
    const pinpoint = pinpoints.find(p => p.id === pinpointId);
    if (!pinpoint) return;
    
    if (connectingFrom) {
        if (connectingFrom.id === pinpointId) {
            // Cancel connection
            connectingFrom = null;
            renderPinpoints();
        } else {
            // Complete connection to a different pinpoint
            showConnectModal(pinpoint);
        }
    } else {
        // Start connection
        connectingFrom = pinpoint;
        renderPinpoints();
    }
}

function deletePinpoint(pinpointId, event) {
    if (event) event.stopPropagation();
    if (!confirm('Delete this pinpoint and all its connections?')) return;
    
    // Remove pinpoint
    pinpoints = pinpoints.filter(p => p.id !== pinpointId);
    
    // Remove all connections involving this pinpoint
    connections = connections.filter(c => Number(c.from) !== Number(pinpointId) && Number(c.to) !== Number(pinpointId));
    
    savePinpoints();
    saveConnections();
    renderPinpoints();
    renderConnections();
}

// ==================== CONNECTION MANAGEMENT ====================
function showConnectModal(toPinpoint) {
    if (!connectingFrom) return;
    
    document.getElementById('connectModal').style.display = 'flex';
    document.getElementById('distanceInput').value = '';
    document.getElementById('transportModeSelect').value = '';
    document.getElementById('distanceInput').focus();
    
    document.getElementById('connectModal').dataset.toId = toPinpoint.id;
}

function closeConnectModal() {
    document.getElementById('connectModal').style.display = 'none';
}

function submitConnection() {
    const distance = parseFloat(document.getElementById('distanceInput').value);
    const mode = document.getElementById('transportModeSelect').value;
    const toId = parseInt(document.getElementById('connectModal').dataset.toId);
    
    if (!distance || !mode || !connectingFrom) return;
    
    if (connectingFrom.id === toId) {
        alert('Cannot connect a pinpoint to itself!');
        return;
    }
    
    const toPinpoint = pinpoints.find(p => p.id === toId);
    if (!toPinpoint) return;
    
    // Check if connection already exists with this mode
    const existingConnection = connections.find(c => 
        ((c.from === connectingFrom.id && c.to === toId) || 
         (c.from === toId && c.to === connectingFrom.id)) &&
        c.mode === mode
    );
    
    if (existingConnection) {
        alert('Connection with this transportation mode already exists!');
        return;
    }
    
    const connection = {
        id: Date.now(),
        from: connectingFrom.id,
        to: toId,
        distance: distance,
        mode: mode
    };
    
    connections.push(connection);
    saveConnections();
    renderConnections();
    
    connectingFrom = null;
    renderPinpoints();
    closeConnectModal();
}

function renderConnections() {
    const layer = document.getElementById('connectionsLayer');
    layer.innerHTML = '';
    
    // Group connections by pinpoint pairs
    const grouped = {};
    connections.forEach(conn => {
        const key = [conn.from, conn.to].sort().join('-');
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(conn);
    });
    
    Object.values(grouped).forEach(group => {
        const fromPinpoint = pinpoints.find(p => p.id === group[0].from);
        const toPinpoint = pinpoints.find(p => p.id === group[0].to);
        
        if (!fromPinpoint || !toPinpoint) return;
        
        const dx = toPinpoint.x - fromPinpoint.x;
        const dy = toPinpoint.y - fromPinpoint.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const angle = Math.atan2(dy, dx) * 180 / Math.PI;
        
        // Offset for multiple lines
        const offsetStep = 4;
        const totalOffset = (group.length - 1) * offsetStep;
        
        group.forEach((conn, index) => {
            const offset = index * offsetStep - totalOffset / 2;
            
            const line = document.createElement('div');
            line.className = 'connection-line';
            line.style.left = fromPinpoint.x + 'px';
            line.style.top = (fromPinpoint.y + offset) + 'px';
            line.style.width = distance + 'px';
            line.style.transform = `rotate(${angle}deg)`;
            line.style.background = TRANSPORT_MODES[conn.mode].color;
            line.style.backgroundColor = TRANSPORT_MODES[conn.mode].color;
            line.dataset.id = conn.id;
            
            line.addEventListener('click', () => {
                selectedLine = conn.id;
                line.style.height = '5px';
                setTimeout(() => {
                    if (selectedLine === conn.id) {
                        line.style.height = '3px';
                        selectedLine = null;
                    }
                }, 2000);
            });
            
            layer.appendChild(line);
        });
        
        // Add distance labels
        const midX = (fromPinpoint.x + toPinpoint.x) / 2;
        const midY = (fromPinpoint.y + toPinpoint.y) / 2;
        
        const distances = group.map(c => c.distance).join(', ');
        
        const label = document.createElement('div');
        label.className = 'connection-label';
        label.style.left = midX + 'px';
        label.style.top = midY + 'px';
        label.textContent = distances;
        
        layer.appendChild(label);
    });
}

function deleteConnection(connectionId) {
    connections = connections.filter(c => c.id !== connectionId);
    saveConnections();
    renderConnections();
}

// ==================== ROUTE FINDING ====================
function validateRouteInputs() {
    const fromInput = document.getElementById('fromInput').value.trim();
    const toInput = document.getElementById('toInput').value.trim();
    
    const fromValid = pinpoints.some(p => p.name === fromInput);
    const toValid = pinpoints.some(p => p.name === toInput);
    
    document.getElementById('searchBtn').disabled = !(fromValid && toValid && fromInput !== toInput);
}

function findRoutes() {
    const fromName = document.getElementById('fromInput').value.trim();
    const toName = document.getElementById('toInput').value.trim();
    
    const fromPinpoint = pinpoints.find(p => p.name === fromName);
    const toPinpoint = pinpoints.find(p => p.name === toName);
    
    if (!fromPinpoint || !toPinpoint) return;
    
    const routes = findAllRoutes(fromPinpoint.id, toPinpoint.id);
    const sortBy = document.querySelector('.sort-btn.active').dataset.sort;
    
    // Sort routes
    routes.sort((a, b) => {
        if (sortBy === 'fastest') {
            return a.duration - b.duration;
        } else {
            return a.cost - b.cost;
        }
    });
    
    // Display top 10 routes
    displayRoutes(routes.slice(0, 10));
}

function findAllRoutes(fromId, toId, visited = new Set(), currentPath = []) {
    if (fromId === toId) {
        return [currentPath];
    }
    
    visited.add(fromId);
    const routes = [];
    
    // Find all connections from current pinpoint
    const nextConnections = connections.filter(c => 
        (c.from === fromId || c.to === fromId) && 
        !visited.has(c.from === fromId ? c.to : c.from)
    );
    
    nextConnections.forEach(conn => {
        const nextId = conn.from === fromId ? conn.to : conn.from;
        const newPath = [...currentPath, conn];
        const newVisited = new Set(visited);
        
        const subRoutes = findAllRoutes(nextId, toId, newVisited, newPath);
        routes.push(...subRoutes);
    });
    
    return routes;
}

function displayRoutes(routes) {
    const container = document.getElementById('routeResults');
    container.innerHTML = '';
    
    if (routes.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #999;">No routes found</p>';
        return;
    }
    
    routes.forEach(route => {
        const routeInfo = calculateRouteInfo(route);
        
        const div = document.createElement('div');
        div.className = 'route-item';
        
        const steps = routeInfo.steps.map((step, i) => 
            `${i + 1}. ${step.from} → ${step.to} (${step.mode.charAt(0).toUpperCase() + step.mode.slice(1)})`
        ).join('<br>');
        
        const durationHours = (routeInfo.duration / 60).toFixed(1);
        const costFormatted = 'Rp' + routeInfo.cost.toLocaleString('id-ID');
        
        div.innerHTML = `
            <div class="route-name">${routeInfo.name}</div>
            <div class="route-steps">${steps}</div>
            <div class="route-info">
                <span>${durationHours}h</span>
                <span>${costFormatted}</span>
            </div>
        `;
        
        container.appendChild(div);
    });
}

function calculateRouteInfo(route) {
    let totalDuration = 0;
    let totalCost = 0;
    const steps = [];
    
    route.forEach(conn => {
        const fromPinpoint = pinpoints.find(p => p.id === conn.from);
        const toPinpoint = pinpoints.find(p => p.id === conn.to);
        const mode = TRANSPORT_MODES[conn.mode];
        
        const duration = (conn.distance / mode.speed) * 60; // in minutes
        const cost = conn.distance * mode.cost;
        
        totalDuration += duration;
        totalCost += cost;
        
        steps.push({
            from: fromPinpoint.name,
            to: toPinpoint.name,
            mode: conn.mode
        });
    });
    
    const name = steps[0].from + ' - ' + steps[steps.length - 1].to;
    
    return {
        name,
        steps,
        duration: totalDuration,
        cost: totalCost
    };
}

// ==================== LOCAL STORAGE ====================
function savePinpoints() {
    localStorage.setItem('pinpoints', JSON.stringify(pinpoints));
    localStorage.setItem('nextPinpointId', nextPinpointId.toString());
}

function saveConnections() {
    localStorage.setItem('connections', JSON.stringify(connections));
}

// ==================== GLOBAL FUNCTIONS ====================
window.closeAddPinpointModal = closeAddPinpointModal;
window.submitPinpoint = submitPinpoint;
window.closeConnectModal = closeConnectModal;
window.submitConnection = submitConnection;
window.startConnection = startConnection;
window.deletePinpoint = deletePinpoint;
