const VPS_API_URL = CONFIG.API_URL;

// Updated Frontend Bridge for your Standalone Desktop App
async function fetchNui(endpoint, data = {}) {
    try {
        const baseUrl = (window.api && window.api.VPS_API_URL) ? window.api.VPS_API_URL : VPS_API_URL;

        // Mock fallback for FiveM native functions not present on the VPS desktop app
        if (endpoint === 'getCurrentLocation') {
            return {
                street: 'Central Los Santos / Dispatch HQ',
                coords: { x: 0.0, y: 0.0, z: 0.0 }
            };
        }
        if (endpoint === 'close') {
            window.close();
            return {};
        }
        let url = `${baseUrl}/api/${endpoint}`;
        let method = 'POST';

        if (endpoint === 'searchCitizen') {
            url = `${baseUrl}/api/search/citizen?query=${encodeURIComponent(data.query || data.name || '')}`;
            method = 'GET';
        } else if (endpoint === 'searchPlate') {
            url = `${baseUrl}/api/search/plate/${encodeURIComponent(data.query || data.plate || '')}`;
            method = 'GET';
        } else if (endpoint === 'getReports') {
            url = `${baseUrl}/api/reports`;
            method = 'GET';
        } else if (endpoint === 'getActiveUnits') {
            url = `${baseUrl}/api/units`;
            method = 'GET';
        } else if (endpoint === 'getChatHistory') {
            url = `${baseUrl}/api/chat`;
            method = 'GET';
        } else if (endpoint === 'sendCadMessage') {
            url = `${baseUrl}/api/chat`;
            method = 'POST';
        } else if (endpoint === 'getCallDetails') {
            url = `${baseUrl}/api/calls/${data.callId}`;
            method = 'GET';
        } else if (endpoint === 'createCustomCall') {
            url = `${baseUrl}/api/calls`;
            method = 'POST';
        } else if (endpoint === 'attachUnitToCall') {
            url = `${baseUrl}/api/calls/${data.callId}/attach`;
            method = 'POST';
        } else if (endpoint === 'detachUnitFromCall') {
            url = `${baseUrl}/api/calls/${data.callId}/detach`;
            method = 'POST';
        } else if (endpoint === 'clearCall') {
            url = `${baseUrl}/api/calls/${data.callId}/clear`;
            method = 'POST';
        } else if (endpoint === 'updateCallStatus') {
            url = `${baseUrl}/api/calls/${data.callId}/status`;
            method = 'POST';
        } else if (endpoint === 'addCallNote') {
            url = `${baseUrl}/api/calls/${data.callId}/notes`;
            method = 'POST';
        } else if (endpoint === 'updateOfficerStatus') {
            url = `${baseUrl}/api/officer/status`;
            method = 'POST';
        } else if (endpoint === 'sv_cad:server:submitTicket') {
            url = `${baseUrl}/api/tickets`;
            method = 'POST';
        } else if (endpoint === 'sv_cad:server:submitReport') {
            url = `${baseUrl}/api/reports`;
            method = 'POST';
        }

        const options = {
            method: method,
            headers: { 'Content-Type': 'application/json; charset=UTF-8' }
        };

        if (method === 'POST') {
            options.body = JSON.stringify(data);
        }

        const response = await fetch(url, options);
        if (!response.ok) {
            console.error(`API Error [${response.status}]: ${endpoint}`);
            return null;
        }

        const text = await response.text();
        return text ? JSON.parse(text) : {};
    } catch (err) {
        console.error(`Error communicating with VPS server: ${endpoint}`, err);
        return null;
    }
}

// Active Incident & Officer State
let localOfficer = { callsign: 'Unit', name: 'Officer', serverId: null, status: 'Available' };
let currentActiveCall = null;
let cachedCalls = [];
let cachedUnits = [];
let pendingCallCoords = { x: 0.0, y: 0.0, z: 0.0 };
let pendingAutoRunPlate = null;

function escapeHtml(unsafe) {
    if (unsafe === null || unsafe === undefined) return '';
    return String(unsafe)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function getAttachedCall() {
    if (!localOfficer || !localOfficer.callsign) return null;
    return cachedCalls.find(c => {
        const isClosed = c.isCleared || c.status === 'Closed';
        return !isClosed && Array.isArray(c.assignedUnits) && c.assignedUnits.includes(localOfficer.callsign);
    }) || null;
}

// Auto-routing handler for regular units between Dashboard and Active Call
function checkAndAutoSwitchTab() {
    const isDispatch = localOfficer && String(localOfficer.callsign).trim().toUpperCase() === 'DISPATCH';
    if (isDispatch) return; // Dispatchers can freely navigate anywhere

    const attachedCall = getAttachedCall();
    const activeTabContent = document.querySelector('.tab-content.active');
    const activeTabId = activeTabContent ? activeTabContent.id : '';

    if (attachedCall) {
        if (activeTabId !== 'calls') {
            showTab('calls');
        }
    } else {
        if (activeTabId === 'calls' || activeTabId === '') {
            showTab('dashboard');
        }
    }
}

function showTab(tabId) {
    const isDispatch = localOfficer && String(localOfficer.callsign).trim().toUpperCase() === 'DISPATCH';

    // List of restricted tabs for regular patrol units
    const restrictedTabs = ['profiles', 'vehicles', 'tickets', 'reports', 'units', 'chat', 'createcall'];

    if (!isDispatch && restrictedTabs.includes(tabId)) {
        console.warn("Access denied: Regular units can only access Dashboard and Active Call.");
        tabId = 'dashboard'; // Force redirect back to dashboard
    }

    const attachedCall = getAttachedCall();

    if (tabId !== 'calls') {
        if (attachedCall) {
            currentActiveCall = attachedCall;
            updateFooterBar();
            renderCallDetails(attachedCall);
        } else {
            resetActiveCallView();
        }
    } else if (tabId === 'calls') {
        if (attachedCall) {
            currentActiveCall = attachedCall;
            updateFooterBar();
            renderCallDetails(attachedCall);
        }
    }

    const tabContents = document.querySelectorAll('.tab-content, .tab-pane, [data-tab-content]');
    tabContents.forEach(tab => {
        tab.style.display = 'none';
        tab.classList.remove('active');
    });

    const tabButtons = document.querySelectorAll('.tab-btn, .nav-btn, [data-tab-btn]');
    tabButtons.forEach(btn => {
        btn.classList.remove('active');
    });

    const targetContent = document.getElementById(tabId) || document.querySelector(`[data-tab="${tabId}"]`);
    if (targetContent) {
        targetContent.style.display = 'block';
        targetContent.classList.add('active');
    }

    const matchingBtn = document.querySelector(`[onclick*="${tabId}"]`) || document.querySelector(`[data-tab-btn="${tabId}"]`);
    if (matchingBtn) {
        matchingBtn.classList.add('active');
    }

    hideAllContextMenus();

    if (tabId === 'units') {
        fetchActiveUnits();
    } else if (tabId === 'createcall') {
        autofillCurrentLocation();
    } else if (tabId === 'reports') {
        fetchFiledReports();
    } else if (tabId === 'dashboard') {
        fetchActiveUnits();
    } else if (tabId === 'chat') {
        loadChatHistory();
    }
}
window.showTab = showTab;

async function closeMDT() {
    const baseUrl = (window.api && window.api.VPS_API_URL) ? window.api.VPS_API_URL : VPS_API_URL;
    // Notify the VPS backend and wait for session clearance first
    if (localOfficer && localOfficer.callsign) {
        try {
            await fetch(`${baseUrl}/api/officer/logout`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ callsign: localOfficer.callsign })
            });
        } catch (err) {
            console.error("Logout notification failed:", err);
        }
    }

    const attachedCall = getAttachedCall();
    if (attachedCall) {
        currentActiveCall = attachedCall;
        updateFooterBar();
        renderCallDetails(attachedCall);
    } else {
        resetActiveCallView();
    }

    const container = document.getElementById('mdt-container');
    if (container) {
        container.style.display = 'none';
        container.classList.remove('dash-mounted');
    }
    toggleAttachModal(false);
    hideAllContextMenus();
    
    fetchNui('close', {});
}
window.closeMDT = closeMDT;

window.addEventListener('beforeunload', (e) => {
    const baseUrl = (window.api && window.api.VPS_API_URL) ? window.api.VPS_API_URL : VPS_API_URL;
    if (localOfficer && localOfficer.callsign) {
        // Synchronous fallback request to guarantee logout state on exit
        const xhr = new XMLHttpRequest();
        xhr.open('POST', `${baseUrl}/api/officer/logout`, false);
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.send(JSON.stringify({ callsign: localOfficer.callsign }));
    }
});

function hideAllContextMenus() {
    hideUnitContextMenu();
    hideSelfStatusContextMenu();
    hideAssignedUnitContextMenu();
    hideDashboardCallContextMenu();
}

function updateScreenStatusOutline() {
    const container = document.getElementById('mdt-container');
    if (!container) return;

    container.classList.remove('status-outline-detail', 'status-outline-oos');

    const s = String(localOfficer.status || '').toLowerCase();
    if (s.includes('detail')) {
        container.classList.add('status-outline-detail');
    } else if (s.includes('oos')) {
        container.classList.add('status-outline-oos');
    }
}

function updateFooterBar() {
    const label = document.getElementById('footer-call-label');
    const btns = document.querySelectorAll('.footer-actions .action-btn');
    const btnEnroute = document.getElementById('btn-enroute');
    const btnScene = document.getElementById('btn-scene');

    const currentStatus = String(localOfficer.status || '').toLowerCase();

    if (currentActiveCall) {
        const isClosed = currentActiveCall.isCleared || currentActiveCall.status === 'Closed';
        if (label) {
            label.textContent = `CALL #${currentActiveCall.id}: ${currentActiveCall.title} [${currentActiveCall.status || 'ACTIVE'}]`;
            label.classList.add('active');
        }

        btns.forEach(btn => {
            if (btn) btn.disabled = isClosed;
        });

        if (!isClosed) {
            if (btnEnroute) {
                btnEnroute.disabled = currentStatus.includes('en route');
            }
            if (btnScene) {
                btnScene.disabled = currentStatus.includes('scene');
            }
        }
    } else {
        if (label) {
            label.textContent = 'NO ACTIVE CALL SELECTED';
            label.classList.remove('active');
        }
        
        btns.forEach(btn => { 
            if (btn) btn.disabled = true; 
        });
    }

    if (btnEnroute && currentStatus.includes('en route')) {
        btnEnroute.disabled = true;
    }
    if (btnScene && currentStatus.includes('scene')) {
        btnScene.disabled = true;
    }
}

function resetActiveCallView() {
    currentActiveCall = null;
    updateFooterBar();
    const detailsContainer = document.getElementById('call-details');
    if (detailsContainer) {
        detailsContainer.innerHTML = '<p class="no-calls">Select a call from the dashboard or incoming queue to view incident management.</p>';
    }
}

function renderDashboardCalls() {
    const callsContainer = document.getElementById('active-calls-list');
    const searchInput = document.getElementById('dashboard-call-search');
    if (!callsContainer) return;

    const filterQuery = (searchInput ? searchInput.value : '').trim().toLowerCase();
    callsContainer.innerHTML = '';

    const filtered = cachedCalls.filter(call => {
        if (!filterQuery) return true;
        const idMatch = String(call.id || '').toLowerCase().includes(filterQuery);
        const codeMatch = String(call.code || '').toLowerCase().includes(filterQuery);
        const titleMatch = String(call.title || '').toLowerCase().includes(filterQuery);
        const locationMatch = String(call.location || '').toLowerCase().includes(filterQuery);
        const unitMatch = Array.isArray(call.assignedUnits) && call.assignedUnits.some(u => String(u).toLowerCase().includes(filterQuery));
        return idMatch || codeMatch || titleMatch || locationMatch || unitMatch;
    });

    if (filtered.length === 0) {
        callsContainer.innerHTML = filterQuery 
            ? '<div class="no-calls">No call records matching your search query.</div>'
            : '<div class="no-calls">No incident history or active dispatches.</div>';
        return;
    }

    filtered.forEach(call => {
        const isClosed = call.isCleared || call.status === 'Closed';
        const displayStatus = isClosed ? 'CLOSED' : (call.status || 'ACTIVE').toUpperCase();

        const row = document.createElement('div');
        row.id = `call-row-${call.id}`;
        row.className = `call-row ${isClosed ? 'is-cleared' : 'is-active'}`;
        row.style.cursor = 'pointer';

        row.innerHTML = `
            <span class="call-code ${isClosed ? 'cleared' : ''}">${call.code || '10-99'}</span>
            <span class="call-title">#${call.id} - ${call.title || 'Incident'}</span>
            <span class="call-status-tag ${isClosed ? 'cleared' : 'active'}">${displayStatus}</span>
            <span class="call-location">${call.location || 'Unknown Location'}</span>
        `;

        row.addEventListener('click', () => openCallDetails(call.id));

        row.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            showDashboardCallContextMenu(e.pageX, e.pageY, call);
        });

        callsContainer.appendChild(row);
    });
}

function clearDashboardSearch() {
    const searchInput = document.getElementById('dashboard-call-search');
    if (searchInput) {
        searchInput.value = '';
        renderDashboardCalls();
    }
}
window.clearDashboardSearch = clearDashboardSearch;

let contextTargetCall = null;

function showDashboardUnitContextMenu(x, y, unit) {
    const menu = document.getElementById('unit-context-menu');
    const trackBtn = document.getElementById('ctx-track-unit');
    const cancelBtn = document.getElementById('ctx-cancel-tracking');

    if (!menu) return;
    contextTargetUnit = unit;

    const isDispatch = localOfficer && String(localOfficer.callsign).trim().toUpperCase() === 'DISPATCH';

    if (!isDispatch) {
        if (trackBtn) trackBtn.style.display = 'none';
        if (cancelBtn) cancelBtn.style.display = 'none';
    } else {
        if (activeTrackedServerId === unit.id) {
            if (trackBtn) trackBtn.style.display = 'none';
            if (cancelBtn) cancelBtn.style.display = 'block';
        } else {
            if (trackBtn) trackBtn.style.display = 'block';
            if (cancelBtn) cancelBtn.style.display = activeTrackedServerId ? 'block' : 'none';
        }
    }

    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
    menu.style.display = 'block';
}

function showUnitContextMenu(x, y, unit) {
    const menu = document.getElementById('unit-context-menu');
    const trackBtn = document.getElementById('ctx-track-unit');
    const cancelBtn = document.getElementById('ctx-cancel-tracking');

    if (!menu) return;
    contextTargetUnit = unit;

    const isDispatch = localOfficer && String(localOfficer.callsign).trim().toUpperCase() === 'DISPATCH';

    if (!isDispatch) {
        if (trackBtn) trackBtn.style.display = 'none';
        if (cancelBtn) cancelBtn.style.display = 'none';
    } else {
        if (activeTrackedServerId === unit.id) {
            if (trackBtn) trackBtn.style.display = 'none';
            if (cancelBtn) cancelBtn.style.display = 'block';
        } else {
            if (trackBtn) trackBtn.style.display = 'block';
            if (cancelBtn) cancelBtn.style.display = activeTrackedServerId ? 'block' : 'none';
        }
    }

    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
    menu.style.display = 'block';
}

function hideDashboardCallContextMenu() {
    const menu = document.getElementById('dashboard-call-context-menu');
    if (menu) menu.style.display = 'none';
    contextTargetCall = null;
}

async function autofillCurrentLocation() {
    const locInput = document.getElementById('call-location-input');
    const result = await fetchNui('getCurrentLocation', {});
    if (result && locInput) {
        locInput.value = result.street || 'Current Position';
        pendingCallCoords = result.coords || { x: 0.0, y: 0.0, z: 0.0 };
    }
}
window.autofillCurrentLocation = autofillCurrentLocation;

async function submitNewCall(e) {
    e.preventDefault();

    const code = document.getElementById('call-code-input').value.trim();
    const title = document.getElementById('call-title-input').value.trim();
    const location = document.getElementById('call-location-input').value.trim();
    const description = document.getElementById('call-desc-input').value.trim();

    const newCallData = {
        code: code,
        title: title,
        location: location,
        description: description,
        coords: pendingCallCoords
    };

    const createdCall = await fetchNui('createCustomCall', newCallData);

    document.getElementById('create-call-form').reset();
    pendingCallCoords = { x: 0.0, y: 0.0, z: 0.0 };

    if (createdCall && createdCall.id) {
        openCallDetails(createdCall.id);
    } else {
        showTab('calls');
    }
}
window.submitNewCall = submitNewCall;

async function openCallDetails(callId) {
    showTab('calls');
    const detailsContainer = document.getElementById('call-details');
    if (detailsContainer) {
        detailsContainer.innerHTML = '<div class="loading">Loading incident data...</div>';
    }

    const callData = await fetchNui('getCallDetails', { callId: callId });
    if (!callData) return;

    currentActiveCall = callData;
    updateFooterBar();
    renderCallDetails(callData);
}
window.openCallDetails = openCallDetails;

function renderCallDetails(callData) {
    const detailsContainer = document.getElementById('call-details');
    if (!detailsContainer) return;

    const assigned = callData.assignedUnits || [];
    const notes = callData.notes || [];
    const isClosed = callData.isCleared || callData.status === 'Closed';

    const isOfficerAttached = assigned.includes(localOfficer.callsign);

    detailsContainer.innerHTML = `
        <div class="active-call-split-container">
            <div class="call-left-panel">
                <div class="call-meta-bar">
                    <span class="call-code ${isClosed ? 'cleared' : ''}">${callData.code || '10-00'}</span>
                    <h3>Incident #${callData.id || ''} - ${callData.title || 'Call Details'}</h3>
                </div>
                <p><strong>Status:</strong> <span id="current-call-status-badge">${(callData.status || 'Active').toUpperCase()}</span></p>
                <p><strong>Location:</strong> ${callData.location || 'Unknown'}</p>
                <p><strong>Timestamp:</strong> ${callData.time || 'N/A'}</p>
                <p style="margin-top: 10px;"><strong>Narrative / Dispatch Info:</strong></p>
                <p style="background:#0f172a; padding:10px; border-radius:4px; border:1px solid #334155; margin-top:4px;">${callData.description || 'No notes provided.'}</p>
                
                <div class="call-assigned-units">
                    <strong>Assigned Units:</strong> ${!isClosed ? '<span style="font-size: 0.75rem; color: #94a3b8; font-weight: normal;">(Right-click to detach)</span>' : ''}
                    <div class="assigned-chips" id="assigned-units-list"></div>
                </div>
            </div>

            <div class="call-right-panel">
                <div class="notes-panel-header">
                    <h3>Incident Notes & Log</h3>
                    <span style="font-size: 0.8rem; color:#94a3b8;">#${callData.id}</span>
                </div>

                <div class="call-notes-feed" id="call-notes-feed">
                    ${notes.length === 0 ? '<div class="no-calls" style="padding:4px 0;">No logs or notes posted.</div>' : ''}
                </div>

                <div class="add-note-box">
                    <input type="text" id="call-note-input" placeholder="${isOfficerAttached ? 'Type incident note or observation...' : 'Must be attached to call to add notes'}" ${(!isOfficerAttached || isClosed) ? 'disabled' : ''}>
                    <button id="call-note-btn" onclick="submitCallNote()" ${(!isOfficerAttached || isClosed) ? 'disabled' : ''}>Add Note</button>
                </div>
                ${(!isOfficerAttached && !isClosed) ? '<div class="note-locked-hint">Attach your unit to this call via "+ Add Unit" to post notes.</div>' : ''}
            </div>
        </div>
    `;

    const chipsContainer = document.getElementById('assigned-units-list');
    if (chipsContainer) {
        if (assigned.length === 0) {
            chipsContainer.innerHTML = '<span style="color:#64748b; font-size:0.85rem;">No auxiliary units attached</span>';
        } else {
            assigned.forEach(callsign => {
                const chip = document.createElement('span');
                chip.className = 'unit-chip';
                chip.textContent = callsign;

                if (!isClosed) {
                    chip.addEventListener('contextmenu', (e) => {
                        e.preventDefault();
                        showAssignedUnitContextMenu(e.pageX, e.pageY, callsign);
                    });
                }
                chipsContainer.appendChild(chip);
            });
        }
    }

    const feedContainer = document.getElementById('call-notes-feed');
    if (feedContainer && notes.length > 0) {
        feedContainer.innerHTML = '';
        notes.forEach(item => {
            const isStatusLog = item.isLog === true;
            const noteEl = document.createElement('div');
            noteEl.className = `note-item ${isStatusLog ? 'status-log' : ''}`;
            noteEl.innerHTML = `
                <div class="note-meta">
                    <span class="note-author">${item.author || 'CAD'}</span>
                    <span>${item.time || ''}</span>
                </div>
                <div class="note-text">${item.text}</div>
            `;
            feedContainer.appendChild(noteEl);
        });
        feedContainer.scrollTop = feedContainer.scrollHeight;
    }

    const noteInput = document.getElementById('call-note-input');
    if (noteInput && isOfficerAttached && !isClosed) {
        noteInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') submitCallNote();
        });
    }
}

async function submitCallNote() {
    if (!currentActiveCall) return;
    const noteInput = document.getElementById('call-note-input');
    if (!noteInput) return;

    const text = noteInput.value.trim();
    if (!text) return;

    const res = await fetchNui('addCallNote', {
        callId: currentActiveCall.id,
        text: text
    });

    if (res && res.notes) {
        currentActiveCall.notes = res.notes;
        renderCallDetails(currentActiveCall);
    }

    noteInput.value = '';
}
window.submitCallNote = submitCallNote;

async function setCallStatus(newStatus) {
    if (!currentActiveCall) return;

    const mappedStatus = newStatus === 'enroute' ? 'En Route' : 'On Scene';
    const currentStatus = String(localOfficer.status || '').toLowerCase();

    if (newStatus === 'enroute' && currentStatus.includes('en route')) return;
    if (newStatus === 'scene' && currentStatus.includes('scene')) return;

    localOfficer.status = mappedStatus;
    updateFooterBar();
    updateScreenStatusOutline();

    fetchNui('updateOfficerStatus', { status: mappedStatus });

    await fetchNui('updateCallStatus', {
        callId: currentActiveCall.id,
        status: mappedStatus,
        coords: currentActiveCall.coords
    });
}
window.setCallStatus = setCallStatus;

async function clearCurrentCall() {
    if (!currentActiveCall) return;

    const targetId = currentActiveCall.id;
    await fetchNui('clearCall', { callId: targetId });

    const cached = cachedCalls.find(c => c.id === targetId);
    if (cached) {
        cached.status = 'Closed';
        cached.isCleared = true;
        cached.assignedUnits = [];
    }

    localOfficer.status = 'Available';
    updateScreenStatusOutline();
    fetchNui('updateOfficerStatus', { status: 'Available' });

    resetActiveCallView();
    renderDashboardCalls();
    checkAndAutoSwitchTab();
}
window.clearCurrentCall = clearCurrentCall;

async function toggleAttachModal(show = true) {
    const modal = document.getElementById('attach-unit-modal');
    if (!modal) return;

    if (!show || !currentActiveCall) {
        modal.style.display = 'none';
        return;
    }

    modal.style.display = 'flex';
    const listContainer = document.getElementById('attach-units-list');
    if (listContainer) listContainer.innerHTML = '<div class="loading">Loading on-duty units...</div>';

    const units = await fetchNui('getActiveUnits', {});
    if (listContainer) listContainer.innerHTML = '';

    const assigned = currentActiveCall.assignedUnits || [];
    const unattachedUnits = (units || []).filter(u => !assigned.includes(u.callsign));

    if (unattachedUnits.length === 0) {
        if (listContainer) listContainer.innerHTML = '<div class="no-results">No additional units available to attach.</div>';
        return;
    }

    unattachedUnits.forEach(u => {
        const row = document.createElement('div');
        row.className = 'attach-unit-row';
        row.innerHTML = `
            <div>
                <strong>${u.callsign}</strong> - ${u.name}
            </div>
            <button class="attach-btn" onclick="attachUnitToCall('${u.callsign}')">Attach</button>
        `;
        if (listContainer) listContainer.appendChild(row);
    });
}
window.toggleAttachModal = toggleAttachModal;

async function attachUnitToCall(callsign) {
    if (!currentActiveCall) return;

    const res = await fetchNui('attachUnitToCall', {
        callId: currentActiveCall.id,
        callsign: callsign
    });

    if (res && res.assignedUnits) {
        currentActiveCall.assignedUnits = res.assignedUnits;
        currentActiveCall.status = 'Assigned';
        renderCallDetails(currentActiveCall);
    }

    toggleAttachModal(false);
    checkAndAutoSwitchTab();
}
window.attachUnitToCall = attachUnitToCall;

let contextSelectedUnitCallsign = null;

function showAssignedUnitContextMenu(x, y, callsign) {
    const menu = document.getElementById('assigned-unit-context-menu');
    if (!menu) return;

    contextSelectedUnitCallsign = callsign;
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
    menu.style.display = 'block';
}

function hideAssignedUnitContextMenu() {
    const menu = document.getElementById('assigned-unit-context-menu');
    if (menu) menu.style.display = 'none';
    contextSelectedUnitCallsign = null;
}

async function detachSelectedUnit() {
    if (!currentActiveCall || !contextSelectedUnitCallsign) return;

    const callsign = contextSelectedUnitCallsign;
    const targetCallId = currentActiveCall.id;

    const res = await fetchNui('detachUnitFromCall', {
        callId: targetCallId,
        callsign: callsign
    });

    hideAssignedUnitContextMenu();

    if (res && res.assignedUnits) {
        currentActiveCall.assignedUnits = res.assignedUnits;
        renderCallDetails(currentActiveCall);
    }
    checkAndAutoSwitchTab();
}

async function executeNameLookup(overrideQuery = null) {
    const searchInput = document.getElementById('name-search-input');
    const resultsContainer = document.getElementById('name-results-container');

    const query = overrideQuery ? overrideQuery.trim() : (searchInput ? searchInput.value.trim() : '');
    if (!query) return;

    if (searchInput) searchInput.value = query;

    if (resultsContainer) {
        resultsContainer.innerHTML = '<div class="loading">Searching citizen database...</div>';
    }

    const results = await fetchNui('searchCitizen', { query: query });
    renderPersonResults(results);
}
window.executeNameLookup = executeNameLookup;

function crossReferenceOwner(ownerName) {
    if (!ownerName || ownerName === 'Unknown' || ownerName === 'Unregistered' || ownerName === 'N/A') return;
    showTab('profiles');
    executeNameLookup(ownerName);
}
window.crossReferenceOwner = crossReferenceOwner;

function renderPersonResults(data) {
    const resultsContainer = document.getElementById('name-results-container');
    const detailView = document.getElementById('citizen-detail-view');

    if (detailView) detailView.style.display = 'none';
    if (!resultsContainer) return;

    resultsContainer.style.display = 'block';
    resultsContainer.innerHTML = '';

    const list = Array.isArray(data) ? data : (data && [data]) || [];
    if (list.length === 0) {
        resultsContainer.innerHTML = '<div class="no-results">No citizens found matching that query.</div>';
        return;
    }

    if (list.length === 1) {
        showCitizenProfile(list[0]);
        return;
    }

    list.forEach(person => {
        const row = document.createElement('div');
        row.className = 'person-result-row';

        const firstName = person.firstname || person.name || 'Unknown';
        const lastName = person.lastname || '';
        const dob = person.dob || person.birthdate || 'N/A';
        const sourceLabel = person.source ? `[${person.source.toUpperCase()}]` : '';

        row.innerHTML = `
            <span>${firstName} ${lastName} <small style="color:#64748b;">${sourceLabel}</small></span>
            <span class="person-result-dob">DOB: ${dob}</span>
        `;

        row.addEventListener('click', () => {
            showCitizenProfile(person);
        });

        resultsContainer.appendChild(row);
    });
}

function showCitizenProfile(person) {
    const resultsContainer = document.getElementById('name-results-container');
    const detailView = document.getElementById('citizen-detail-view');
    const detailContent = document.getElementById('citizen-detail-content');

    if (!detailView || !detailContent) return;

    if (resultsContainer) resultsContainer.style.display = 'none';
    detailView.style.display = 'block';

    const firstName = person.firstname || person.name || 'Unknown';
    const lastName = person.lastname || '';
    const fullName = `${firstName} ${lastName}`.trim();
    const escapedName = fullName.replace(/'/g, "\\'");
    const hasWarrants = person.warrants && person.warrants !== 'None' && person.warrants !== '';
    const hasFlags = person.flags && person.flags !== 'None' && person.flags !== '';
    const tickets = Array.isArray(person.tickets) ? person.tickets : [];
    const reports = Array.isArray(person.reports) ? person.reports : [];

    let ticketsHtml = '';
    if (tickets.length === 0) {
        ticketsHtml = '<span style="color:#64748b; font-size:0.85rem;">No citations on record.</span>';
    } else {
        tickets.forEach(t => {
            const ticketObjJson = encodeURIComponent(JSON.stringify(t));
            ticketsHtml += `
                <div onclick="viewTicketInCAD('${ticketObjJson}', '${escapedName}')" style="background:#1e293b; padding:8px 12px; border-radius:4px; border:1px solid #334155; margin-bottom:6px; font-size:0.85rem; cursor:pointer;" title="Click to open ticket in CAD">
                    <div style="display:flex; justify-content:space-between; color:#38bdf8; font-weight:bold;">
                        <span>Citation #${t.id} - ${t.infraction}</span>
                        <span>$${t.fine_amount}</span>
                    </div>
                    <div style="color:#94a3b8; font-size:0.75rem; margin-top:2px;">
                        Plate: ${t.plate} | Issued By: ${t.officer_callsign} | Date: ${t.created_at} ↗
                    </div>
                </div>
            `;
        });
    }

    let reportsHtml = '';
    if (reports.length === 0) {
        reportsHtml = '<span style="color:#64748b; font-size:0.85rem;">No incident reports on record.</span>';
    } else {
        reports.forEach(r => {
            const reportObjJson = encodeURIComponent(JSON.stringify(r));
            reportsHtml += `
                <div onclick="viewReportInCAD('${reportObjJson}', '${escapedName}')" style="background:#1e293b; padding:8px 12px; border-radius:4px; border:1px solid #334155; margin-bottom:6px; font-size:0.85rem; cursor:pointer;" title="Click to open report in CAD">
                    <div style="display:flex; justify-content:space-between; color:#10b981; font-weight:bold;">
                        <span>Report #${r.id} - ${r.title}</span>
                        <span>${r.report_type}</span>
                    </div>
                    <div style="color:#94a3b8; font-size:0.75rem; margin-top:2px;">
                        Location: ${r.location} | Author: ${r.author_callsign} | Date: ${r.created_at} ↗
                    </div>
                </div>
            `;
        });
    }

    detailContent.innerHTML = `
        <div class="profile-header">
            <div>
                <h3>${fullName}</h3>
                <span class="person-result-dob">Citizen ID: ${person.citizenid || 'N/A'}</span>
            </div>
            <div>
                <button onclick="prefillTicketFromLookup('', '${escapedName}')" style="padding: 5px 10px; background: #3b82f6; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.75rem; font-weight: bold; margin-right: 5px;">Cite</button>
                <button onclick="prefillReport('suspect', '${escapedName}')" style="padding: 5px 10px; background: #10b981; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.75rem; font-weight: bold; margin-right: 5px;">Add to Report</button>
                <span class="source-badge ${person.source === 'ers' ? 'ers' : ''}">${person.source || 'DATABASE'}</span>
            </div>
        </div>
        <div class="profile-grid">
            <div class="profile-field">
                <span class="label">Date of Birth</span>
                <span class="value">${person.dob || person.birthdate || 'N/A'}</span>
            </div>
            <div class="profile-field">
                <span class="label">Gender</span>
                <span class="value">${person.gender === 0 ? 'Male' : person.gender === 1 ? 'Female' : (person.gender || 'N/A')}</span>
            </div>
            <div class="profile-field">
                <span class="label">Driver's License</span>
                <span class="value ${String(person.driver_license || '').toLowerCase() === 'suspended' ? 'value-highlight-red' : 'value-highlight-green'}">${person.driver_license || 'Valid'}</span>
            </div>
            <div class="profile-field">
                <span class="label">Phone Number</span>
                <span class="value">${person.phone || 'N/A'}</span>
            </div>
            <div class="profile-field full-width">
                <span class="label">Active Warrants</span>
                <span class="value ${hasWarrants ? 'value-highlight-red' : ''}">${person.warrants || 'None on record.'}</span>
            </div>
            <div class="profile-field full-width">
                <span class="label">Flags / Warnings</span>
                <span class="value ${hasFlags ? 'value-highlight-red' : ''}">${person.flags || 'None.'}</span>
            </div>
            <div class="profile-field full-width">
                <span class="label">Issued Citations & Tickets (Click to Open in CAD)</span>
                <div style="margin-top: 6px; max-height: 140px; overflow-y: auto;">${ticketsHtml}</div>
            </div>
            <div class="profile-field full-width">
                <span class="label">Involved Incident Reports (Click to Open in CAD)</span>
                <div style="margin-top: 6px; max-height: 140px; overflow-y: auto;">${reportsHtml}</div>
            </div>
        </div>
    `;
}
window.showCitizenProfile = showCitizenProfile;

function viewTicketInCAD(ticketJson, citizenName) {
    const t = JSON.parse(decodeURIComponent(ticketJson));
    const detailContent = document.getElementById('citizen-detail-content');
    if (!detailContent) return;

    detailContent.innerHTML = `
        <button class="back-btn" onclick="executeNameLookup('${citizenName}')" style="margin-bottom: 12px;">← Back to Citizen Profile</button>
        <div class="profile-header">
            <div>
                <h3>Traffic Citation #${t.id}</h3>
                <span class="person-result-dob">Issued: ${t.created_at}</span>
            </div>
            <span class="source-badge">OFFICIAL RECORD</span>
        </div>
        <div class="profile-grid">
            <div class="profile-field"><span class="label">Violator Name</span><span class="value">${t.citizen_name || 'Unknown'}</span></div>
            <div class="profile-field"><span class="label">Vehicle Plate</span><span class="value">${t.plate || 'N/A'}</span></div>
            <div class="profile-field"><span class="label">Infraction / Offense</span><span class="value" style="color:#38bdf8;">${t.infraction}</span></div>
            <div class="profile-field"><span class="label">Fine Amount</span><span class="value" style="color:#10b981; font-weight:bold;">$${t.fine_amount}</span></div>
            <div class="profile-field full-width"><span class="label">Issuing Officer</span><span class="value">${t.officer_name} (${t.officer_callsign})</span></div>
            <div class="profile-field full-width"><span class="label">Officer Notes / Narrative</span><span class="value" style="background:#0f172a; padding:10px; border-radius:4px; display:block; margin-top:4px;">${t.notes || 'No notes provided.'}</span></div>
        </div>
    `;
}
window.viewTicketInCAD = viewTicketInCAD;

async function fetchFiledReports() {
    const reportsContainer = document.getElementById('reports-list-container'); 
    if (!reportsContainer) return;

    reportsContainer.innerHTML = '<div class="loading">Loading filed reports...</div>';

    let reports = [];
    try {
        const res = await fetchNui('getReports', {});
        reports = Array.isArray(res) ? res : (res ? [res] : []);
    } catch (e) {
        console.error("Failed to fetch reports:", e);
        reports = [];
    }

    if (reports.length === 0) {
        reportsContainer.innerHTML = '<div class="no-results">No incident reports on record.</div>';
        return;
    }

    reportsContainer.innerHTML = '';
    reports.forEach(report => {
        const row = document.createElement('div');
        row.className = 'report-row';
        row.style.cssText = 'background: #1e293b; padding: 12px; margin-bottom: 8px; border-radius: 4px; border: 1px solid #334155; display: flex; justify-content: space-between; align-items: center;';
        row.innerHTML = `
            <div class="report-info">
                <strong style="color: #38bdf8;">#${report.id || 'N/A'} - ${report.title || 'Untitled Report'}</strong>
                <div style="font-size: 0.85rem; color: #94a3b8; margin-top: 2px;">
                    Type: ${report.report_type || 'General'} | Location: ${report.location || 'N/A'} | Author: ${report.author_callsign || ''} ${report.author_name || ''}
                </div>
            </div>
            <div class="report-date" style="font-size: 0.8rem; color: #64748b;">${report.created_at || ''}</div>
        `;
        reportsContainer.appendChild(row);
    });
}
window.fetchFiledReports = fetchFiledReports;

function toggleNewReportForm(show) {
    const formBox = document.getElementById('new-report-box');
    if (!formBox) return;

    if (show === true || formBox.style.display === 'none' || !formBox.style.display) {
        formBox.style.display = 'block';
    } else {
        formBox.style.display = 'none';
    }
}
window.toggleNewReportForm = toggleNewReportForm;

function viewReportInCAD(reportJson, citizenName) {
    const r = JSON.parse(decodeURIComponent(reportJson));
    const detailContent = document.getElementById('citizen-detail-content');
    if (!detailContent) return;

    detailContent.innerHTML = `
        <button class="back-btn" onclick="executeNameLookup('${citizenName}')" style="margin-bottom: 12px;">← Back to Citizen Profile</button>
        <div class="profile-header">
            <div>
                <h3>Incident Report #${r.id}: ${r.title}</h3>
                <span class="person-result-dob">Filed: ${r.created_at} | Type: ${r.report_type}</span>
            </div>
            <span class="source-badge">OFFICIAL RECORD</span>
        </div>
        <div class="profile-grid">
            <div class="profile-field"><span class="label">Incident Location</span><span class="value">${r.location}</span></div>
            <div class="profile-field"><span class="label">Report Type</span><span class="value" style="color:#38bdf8;">${r.report_type}</span></div>
            <div class="profile-field"><span class="label">Involved Suspect(s)</span><span class="value">${r.involved_suspects || 'None'}</span></div>
            <div class="profile-field"><span class="label">Involved Vehicle(s)</span><span class="value">${r.involved_vehicles || 'None'}</span></div>
            <div class="profile-field full-width"><span class="label">Reporting Officer</span><span class="value">${r.author_name} (${r.author_callsign})</span></div>
            <div class="profile-field full-width"><span class="label">Officer Narrative / Summary</span><span class="value" style="background:#0f172a; padding:10px; border-radius:4px; display:block; margin-top:4px; white-space:pre-wrap;">${r.incident_summary || 'No narrative provided.'}</span></div>
        </div>
    `;
}
window.viewReportInCAD = viewReportInCAD;

function closeCitizenDetails() {
    const resultsContainer = document.getElementById('name-results-container');
    const detailView = document.getElementById('citizen-detail-view');

    if (detailView) detailView.style.display = 'none';
    if (resultsContainer) resultsContainer.style.display = 'block';
}
window.closeCitizenDetails = closeCitizenDetails;

async function executePlateLookup(overridePlate = null) {
    const searchInput = document.getElementById('plate-search-input');
    const resultsContainer = document.getElementById('plate-results-container');

    const query = overridePlate ? overridePlate.trim() : (searchInput ? searchInput.value.trim() : '');
    if (!query) return;

    if (searchInput) searchInput.value = query;

    if (resultsContainer) {
        resultsContainer.innerHTML = '<div class="loading">Searching vehicle registration database...</div>';
    }

    const results = await fetchNui('searchPlate', { plate: query });
    renderPlateResults(results);
}
window.executePlateLookup = executePlateLookup;

function renderPlateResults(data) {
    const resultsContainer = document.getElementById('plate-results-container');
    const detailView = document.getElementById('vehicle-detail-view');

    if (detailView) detailView.style.display = 'none';
    if (!resultsContainer) return;

    resultsContainer.style.display = 'block';
    resultsContainer.innerHTML = '';

    const list = Array.isArray(data) ? data : (data && [data]) || [];
    if (list.length === 0) {
        resultsContainer.innerHTML = '<div class="no-results">No vehicles found matching that plate or model.</div>';
        return;
    }

    if (list.length === 1) {
        showVehicleProfile(list[0]);
        return;
    }

    list.forEach(veh => {
        const row = document.createElement('div');
        row.className = 'vehicle-result-row';

        const plate = veh.plate || 'UNKNOWN';
        const model = veh.model || 'Unknown Model';
        const owner = veh.owner_name || 'Unknown Owner';

        row.innerHTML = `
            <span><strong>${plate}</strong> - ${model}</span>
            <span class="vehicle-result-sub">Owner: ${owner}</span>
        `;

        row.addEventListener('click', () => {
            showVehicleProfile(veh);
        });

        resultsContainer.appendChild(row);
    });
}

function showVehicleProfile(veh) {
    const resultsContainer = document.getElementById('plate-results-container');
    const detailView = document.getElementById('vehicle-detail-view');
    const detailContent = document.getElementById('vehicle-detail-content');

    if (!detailView || !detailContent) return;

    if (resultsContainer) resultsContainer.style.display = 'none';
    detailView.style.display = 'block';

    const isStolen = (veh.stolen === 1 || veh.stolen === true);
    const hasFlags = veh.flags && veh.flags !== 'None' && veh.flags !== '';
    const ownerName = veh.owner_name || 'Unknown';
    const isOwnerValid = ownerName !== 'Unknown' && ownerName !== 'Unregistered' && ownerName !== 'N/A';
    const escapedOwner = ownerName.replace(/'/g, "\\'");

    detailContent.innerHTML = `
        <div class="profile-header">
            <div>
                <h3>PLATE: ${veh.plate || 'N/A'}</h3>
                <span class="vehicle-result-sub">Model: ${veh.model || 'Unknown'}</span>
            </div>
            <div>
                <button onclick="prefillReport('vehicle', '${veh.plate || ''}')" style="padding: 5px 10px; background: #10b981; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.75rem; font-weight: bold; margin-right: 5px;">Add to Report</button>
                <span class="source-badge ${veh.source === 'ers' ? 'ers' : ''}">${veh.source || 'DATABASE'}</span>
            </div>
        </div>
        <div class="profile-grid">
            <div class="profile-field">
                <span class="label">Registered Owner</span>
                <span class="value">
                    ${isOwnerValid 
                        ? `<span class="clickable-owner-link" onclick="crossReferenceOwner('${escapedOwner}')" title="Click to view citizen profile">${ownerName} ↗</span>` 
                        : ownerName}
                </span>
            </div>
            <div class="profile-field">
                <span class="label">Owner Citizen ID</span>
                <span class="value">
                    ${veh.owner_cid && veh.owner_cid !== 'N/A'
                        ? `<span class="clickable-owner-link" onclick="crossReferenceOwner('${veh.owner_cid}')" title="Click to search by CID">${veh.owner_cid} ↗</span>`
                        : (veh.owner_cid || 'N/A')}
                </span>
            </div>
            <div class="profile-field">
                <span class="label">Registration Status</span>
                <span class="value ${String(veh.registration || '').toLowerCase() === 'expired' ? 'value-highlight-red' : 'value-highlight-green'}">${veh.registration || 'Valid'}</span>
            </div>
            <div class="profile-field">
                <span class="label">Insurance Status</span>
                <span class="value ${String(veh.insurance || '').toLowerCase() === 'expired' ? 'value-highlight-red' : 'value-highlight-green'}">${veh.insurance || 'Valid'}</span>
            </div>
            <div class="profile-field full-width">
                <span class="label">Stolen Status</span>
                <span class="value ${isStolen ? 'value-highlight-red' : 'value-highlight-green'}">${isStolen ? '⚠️ VEHICLE REPORTED STOLEN' : 'Not Reported Stolen'}</span>
            </div>
            <div class="profile-field full-width">
                <span class="label">Vehicle Flags / BOLO</span>
                <span class="value ${hasFlags ? 'value-highlight-red' : ''}">${veh.flags || 'None.'}</span>
            </div>
        </div>
    `;
}
window.showVehicleProfile = showVehicleProfile;

function closeVehicleDetails() {
    document.getElementById('vehicle-detail-view').style.display = 'none';
    document.getElementById('plate-results-container').style.display = 'block';
}
window.closeVehicleDetails = closeVehicleDetails;

let activeTrackedServerId = null;
let contextTargetUnit = null;

async function fetchActiveUnits() {
    const container = document.getElementById('active-units-container');
    if (container) {
        container.innerHTML = '<div class="loading">Fetching on-duty units...</div>';
    }

    const units = await fetchNui('getActiveUnits', {});
    cachedUnits = units || [];
    renderActiveUnits(cachedUnits);
    renderDashboardActiveUnits(cachedUnits);
}
window.fetchActiveUnits = fetchActiveUnits;

function renderDashboardActiveUnits(units) {
    const container = document.getElementById('dashboard-active-units-container');
    const badge = document.getElementById('unit-count-badge');
    if (!container) return;

    container.innerHTML = '';
    if (!units || units.length === 0) {
        container.innerHTML = '<div style="color: #64748b; font-size: 12px; text-align: center; padding: 15px;">No active units online</div>';
        if (badge) badge.innerText = '0';
        return;
    }

    if (badge) badge.innerText = units.length;

    units.forEach(unit => {
        let statusClass = 'status-busy';
        const rawStatus = (unit.status || 'Available').toLowerCase();
        
        if (rawStatus.includes('avail')) statusClass = 'status-available';
        else if (rawStatus.includes('route')) statusClass = 'status-enroute';
        else if (rawStatus.includes('scene')) statusClass = 'status-onscene';

        const unitElement = document.createElement('div');
        unitElement.className = 'unit-item-card';

        const isSelf = (String(unit.callsign).trim().toUpperCase() === String(localOfficer.callsign).trim().toUpperCase());

        if (isSelf) {
            unitElement.style.borderLeft = '3px solid #38bdf8';
        }

        if (activeTrackedServerId === unit.id) {
            unitElement.style.border = '1px solid #38bdf8';
            unitElement.style.background = 'rgba(56, 189, 248, 0.08)';
        }

        const displayStatus = (activeTrackedServerId === unit.id) ? 'TRACKING GPS' : (unit.status || 'Available');

        unitElement.innerHTML = `
            <div class="unit-info">
                <div class="unit-callsign">${escapeHtml(unit.callsign || 'UNIT')} ${isSelf ? '<small style="color:#38bdf8;">(YOU)</small>' : ''}</div>
                <div class="unit-name">${escapeHtml(unit.name || 'Officer')}</div>
            </div>
            <div class="unit-status-badge ${statusClass}">${escapeHtml(displayStatus)}</div>
        `;

        unitElement.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            hideAllContextMenus();

            if (isSelf) {
                showSelfStatusContextMenu(e.pageX, e.pageY);
            } else {
                showDashboardUnitContextMenu(e.pageX, e.pageY, unit);
            }
        });

        container.appendChild(unitElement);
    });
}

function showDashboardUnitContextMenu(x, y, unit) {
    const menu = document.getElementById('unit-context-menu');
    const trackBtn = document.getElementById('ctx-track-unit');
    const cancelBtn = document.getElementById('ctx-cancel-tracking');

    if (!menu) return;
    contextTargetUnit = unit;

    if (activeTrackedServerId === unit.id) {
        if (trackBtn) trackBtn.style.display = 'none';
        if (cancelBtn) cancelBtn.style.display = 'block';
    } else {
        if (trackBtn) trackBtn.style.display = 'block';
        if (cancelBtn) cancelBtn.style.display = activeTrackedServerId ? 'block' : 'none';
    }

    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
    menu.style.display = 'block';
}

function trackDashboardUnit() {
    if (!contextTargetUnit) return;
    activeTrackedServerId = contextTargetUnit.id;
    fetchNui('startTrackingUnit', { targetServerId: contextTargetUnit.id, callsign: contextTargetUnit.callsign });
    hideAllContextMenus();
    renderDashboardActiveUnits(cachedUnits);
    renderActiveUnits(cachedUnits);
}
window.trackDashboardUnit = trackDashboardUnit;

function cancelDashboardTracking() {
    activeTrackedServerId = null;
    fetchNui('stopTrackingUnit', {});
    hideAllContextMenus();
    renderDashboardActiveUnits(cachedUnits);
    renderActiveUnits(cachedUnits);
}
window.cancelDashboardTracking = cancelDashboardTracking;

function getStatusClass(status) {
    const s = String(status || 'Available').toLowerCase();
    if (s.includes('en route')) return 'status-en-route';
    if (s.includes('scene')) return 'status-on-scene';
    if (s.includes('detail')) return 'status-detail';
    if (s.includes('oos')) return 'status-oos';
    return 'status-available';
}

function renderActiveUnits(units) {
    const container = document.getElementById('active-units-container');
    if (!container) return;

    container.innerHTML = '';
    const list = Array.isArray(units) ? units : [];

    if (list.length === 0) {
        container.innerHTML = '<div class="no-results">No law enforcement units currently on duty.</div>';
        return;
    }

    list.forEach(unit => {
        const row = document.createElement('div');
        row.className = 'unit-row';
        const isSelf = (String(unit.callsign).trim().toUpperCase() === String(localOfficer.callsign).trim().toUpperCase());

        if (isSelf) {
            row.classList.add('is-self');
        }

        if (activeTrackedServerId === unit.id) {
            row.classList.add('is-tracked');
        }

        const unitStatusText = (activeTrackedServerId === unit.id) 
            ? 'TRACKING GPS' 
            : (unit.status || 'Available');

        const statusClass = (activeTrackedServerId === unit.id) 
            ? 'status-en-route' 
            : getStatusClass(unit.status);

        row.innerHTML = `
            <span class="unit-callsign">${unit.callsign || 'UNIT'}</span>
            <span class="unit-name">${unit.name || 'Unknown Officer'} ${isSelf ? '<small style="color:#38bdf8;">(YOU)</small>' : ''}</span>
            <span class="unit-rank">${unit.rank || 'Officer'}</span>
            <span class="unit-status ${statusClass}">${unitStatusText}</span>
        `;

        row.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            hideAllContextMenus();

            if (isSelf) {
                showSelfStatusContextMenu(e.pageX, e.pageY);
            } else {
                showUnitContextMenu(e.pageX, e.pageY, unit);
            }
        });

        container.appendChild(row);
    });
}

function hideUnitContextMenu() {
    const menu = document.getElementById('unit-context-menu');
    if (menu) menu.style.display = 'none';
}

function showSelfStatusContextMenu(x, y) {
    const menu = document.getElementById('self-status-context-menu');
    if (!menu) return;

    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
    menu.style.display = 'block';
}

function hideSelfStatusContextMenu() {
    const menu = document.getElementById('self-status-context-menu');
    if (menu) menu.style.display = 'none';
}

async function changeOfficerStatus(newStatus) {
    const baseUrl = (window.api && window.api.VPS_API_URL) ? window.api.VPS_API_URL : VPS_API_URL;
    hideSelfStatusContextMenu();
    localOfficer.status = newStatus;
    updateScreenStatusOutline();
    updateFooterBar();

    if (localOfficer && localOfficer.callsign) {
        try {
            await fetch(`${baseUrl}/api/officer/status`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    callsign: localOfficer.callsign,
                    name: localOfficer.name,
                    rank: localOfficer.rank,
                    status: newStatus
                })
            });
        } catch (err) {
            console.error("Failed to sync status to VPS backend:", err);
        }
    }

    await fetchNui('updateOfficerStatus', { status: newStatus });
    fetchActiveUnits();
}
window.changeOfficerStatus = changeOfficerStatus;

// ==========================================
// DEPARTMENT CHAT TAB LOGIC
// ==========================================

async function loadChatHistory() {
    const chatBox = document.getElementById('chat-messages-box');
    if (chatBox && chatBox.innerHTML.includes('Loading secure channel')) {
        chatBox.innerHTML = '<div style="color: #64748b; font-size: 12px; text-align: center; padding: 15px;">Loading history...</div>';
    }

    const history = await fetchNui('getChatHistory', {});
    if (!chatBox) return;
    chatBox.innerHTML = '';

    if (history && Array.isArray(history) && history.length > 0) {
        history.forEach(msg => appendMessageToChat(msg));
    } else {
        chatBox.innerHTML = '<div style="color: #64748b; font-size: 12px; text-align: center; padding: 15px;">No active chat history.</div>';
    }
    chatBox.scrollTop = chatBox.scrollHeight;

    updateChatRecipientOptions();
}
window.loadChatHistory = loadChatHistory;

function updateChatRecipientOptions() {
    const select = document.getElementById('chat-recipient-select');
    if (!select) return;

    select.innerHTML = '<option value="ALL">All Units (Department Broadcast)</option>';

    if (cachedUnits && Array.isArray(cachedUnits)) {
        cachedUnits.forEach(unit => {
            if (unit.callsign && unit.callsign !== localOfficer.callsign) {
                const opt = document.createElement('option');
                opt.value = unit.callsign;
                opt.textContent = `${unit.name || 'Officer'} (${unit.callsign})`;
                select.appendChild(opt);
            }
        });
    }
}

function appendMessageToChat(data) {
    const chatBox = document.getElementById('chat-messages-box');
    if (!chatBox) return;

    if (chatBox.innerHTML.includes('Loading history') || chatBox.innerHTML.includes('No active chat history')) {
        chatBox.innerHTML = '';
    }

    const msgDiv = document.createElement('div');
    const isPrivate = data.recipient && data.recipient !== 'ALL';
    
    msgDiv.className = `chat-message-item ${isPrivate ? 'private-msg' : 'broadcast-msg'}`;
    
    msgDiv.innerHTML = `
        <span class="chat-time">[${escapeHtml(data.time)}]</span>
        <span class="chat-sender">${escapeHtml(data.senderName)} (${escapeHtml(data.senderCallsign)})</span>
        ${isPrivate ? `<span class="chat-target">to [${escapeHtml(data.recipient)}]</span>` : ''}: 
        <span class="chat-text">${escapeHtml(data.message)}</span>
    `;
    
    chatBox.appendChild(msgDiv);
    chatBox.scrollTop = chatBox.scrollHeight;
}

async function sendChatMessage() {
    const inputField = document.getElementById('chat-message-input');
    const recipientSelect = document.getElementById('chat-recipient-select');
    if (!inputField) return;

    const message = inputField.value.trim();
    if (!message) return;

    const recipient = recipientSelect ? recipientSelect.value : 'ALL';

    const response = await fetchNui('sendCadMessage', {
        recipient: recipient,
        message: message
    });

    if (response && response.success) {
        inputField.value = '';
    }
}
window.sendChatMessage = sendChatMessage;

window.addEventListener('click', () => {
    hideAllContextMenus();
});

// LISTEN FOR IN-GAME CAD OPEN / CLOSE MESSAGES
window.addEventListener('message', (event) => {
    const data = event.data;
    if (data.action === 'display') {
        // Automatically toggle desktop tab visibility based on in-game CAD status
        setCADMode(data.open);
    }
});

window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' || event.code === 'Escape') {
        const modal = document.getElementById('attach-unit-modal');
        if (modal && modal.style.display === 'flex') {
            toggleAttachModal(false);
            return;
        }
        
        const container = document.getElementById('mdt-container');
        if (container) {
            container.style.display = 'none';
            container.classList.remove('dash-mounted');
        }
        hideAllContextMenus();
        toggleAttachModal(false);
        
        fetchNui('close', {});
    }
});

document.addEventListener('DOMContentLoaded', async () => {
    const baseUrl = (window.api && window.api.VPS_API_URL) ? window.api.VPS_API_URL : VPS_API_URL;
    
    // Default to closed mode until in-game CAD is opened
    setCADMode(false);

    try {
        const versionEl = document.getElementById('app-version');
        if (versionEl) versionEl.innerText = 'v1.0.0'; // Updated to match package.json

        if (window.api && window.api.getAppVersion) {
            const version = await window.api.getAppVersion();
            if (versionEl) versionEl.innerText = `v${version}`;
        }
    } catch (error) {
        console.error('Could not load app version:', error);
        const versionEl = document.getElementById('app-version');
        if (versionEl) versionEl.innerText = 'v1.0.0';
    }

    // 1. Load available units for login screen dropdown
    const selectEl = document.getElementById('login-operator-select');
    const hintEl = document.getElementById('login-password-hint');

    if (selectEl) {
        try {
            const res = await fetch(`${baseUrl}/api/all-operators`);
            const operators = await res.json();
            
            selectEl.innerHTML = '';
            
            if (!Array.isArray(operators) || operators.length === 0) {
                selectEl.innerHTML = '<option value="">No police personnel found in database</option>';
            } else {
                operators.forEach(op => {
                    const opt = document.createElement('option');
                    opt.value = JSON.stringify(op);
                    const statusText = op.hasPassword ? '🔒 [Secured]' : '⭐ [First Time Setup]';
                    opt.textContent = `${op.callsign} - ${op.name} (${op.rank}) ${statusText}`;
                    selectEl.appendChild(opt);
                });

                selectEl.addEventListener('change', () => {
                    if (!selectEl.value) return;
                    const selected = JSON.parse(selectEl.value);
                    if (hintEl) {
                        hintEl.textContent = selected.callsign === 'DISPATCH' 
                            ? 'Public station: No password required.' 
                            : (selected.hasPassword ? 'Enter your unit password to login.' : 'First-time setup: Enter a new password to register this unit.');
                    }
                });

                if (selectEl.options.length > 0) {
                    selectEl.selectedIndex = 0;
                    const initialOp = JSON.parse(selectEl.value);
                    if (hintEl) {
                        hintEl.textContent = initialOp.callsign === 'DISPATCH' 
                            ? 'Public station: No password required.' 
                            : (initialOp.hasPassword ? 'Enter your unit password to login.' : 'First-time setup: Enter a new password to register this unit.');
                    }
                }
            }
        } catch (e) {
            console.error("Failed to load operators list:", e);
            selectEl.innerHTML = '<option value="">Error connecting to backend server</option>';
        }
    }

    // 2. Fetch initial dashboard data
    try {
        const response = await fetch(`${baseUrl}/api/dashboard`);
        const dashboardData = await response.json();
        
        if (dashboardData && dashboardData.success) {
            cachedCalls = dashboardData.calls || [];
            renderDashboardCalls();
        }
    } catch (e) {
        console.error("Failed to load initial dashboard from VPS:", e);
    }

    updateFooterBar();
    fetchActiveUnits();

    const closeBtn = document.getElementById('close-btn');
    if (closeBtn) closeBtn.addEventListener('click', closeMDT);

    const nameBtn = document.getElementById('name-search-btn');
    if (nameBtn) nameBtn.addEventListener('click', () => executeNameLookup());

    const nameInput = document.getElementById('name-search-input');
    if (nameInput) {
        nameInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                executeNameLookup();
            }
        });
    }

    const plateInput = document.getElementById('plate-search-input');
    if (plateInput) {
        plateInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                executePlateLookup();
            }
        });
    }

    const chatInput = document.getElementById('chat-message-input');
    if (chatInput) {
        chatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') sendChatMessage();
        });
    }

    const dashSearchInput = document.getElementById('dashboard-call-search');
    if (dashSearchInput) {
        dashSearchInput.addEventListener('input', () => {
            renderDashboardCalls();
        });
    }

    const trackBtn = document.getElementById('ctx-track-unit');
    if (trackBtn) {
        trackBtn.addEventListener('click', () => {
            if (!contextTargetUnit) return;
            activeTrackedServerId = contextTargetUnit.id;
            fetchNui('startTrackingUnit', { targetServerId: contextTargetUnit.id, callsign: contextTargetUnit.callsign });
            hideUnitContextMenu();
            renderActiveUnits(cachedUnits);
        });
    }

    const cancelBtn = document.getElementById('ctx-cancel-tracking');
    if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
            activeTrackedServerId = null;
            fetchNui('stopTrackingUnit', {});
            hideUnitContextMenu();
            renderActiveUnits(cachedUnits);
        });
    }

    const detachBtn = document.getElementById('ctx-detach-unit');
    if (detachBtn) {
        detachBtn.addEventListener('click', () => {
            detachSelectedUnit();
        });
    }

    const callAttachBtn = document.getElementById('ctx-call-attach');
    if (callAttachBtn) {
        callAttachBtn.addEventListener('click', async () => {
            if (!contextTargetCall) return;
            const targetId = contextTargetCall.id;

            const res = await fetchNui('attachUnitToCall', {
                callId: targetId,
                callsign: localOfficer.callsign
            });

            if (res && res.assignedUnits) {
                contextTargetCall.assignedUnits = res.assignedUnits;
                contextTargetCall.status = 'Assigned';
                currentActiveCall = contextTargetCall;
                updateFooterBar();
                renderCallDetails(contextTargetCall);
            }

            hideDashboardCallContextMenu();
            renderDashboardCalls();
            checkAndAutoSwitchTab();
        });
    }

    const callDetachBtn = document.getElementById('ctx-call-detach');
    if (callDetachBtn) {
        callDetachBtn.addEventListener('click', async () => {
            if (!contextTargetCall) return;
            const targetId = contextTargetCall.id;

            await fetchNui('detachUnitFromCall', {
                callId: targetId,
                callsign: localOfficer.callsign
            });

            if (currentActiveCall && currentActiveCall.id === targetId) {
                resetActiveCallView();
            }

            hideDashboardCallContextMenu();
            renderDashboardCalls();
            checkAndAutoSwitchTab();
        });
    }

    const callClearBtn = document.getElementById('ctx-call-clear');
    if (callClearBtn) {
        callClearBtn.addEventListener('click', async () => {
            if (!contextTargetCall) return;
            const targetId = contextTargetCall.id;

            await fetchNui('clearCall', { callId: targetId });

            contextTargetCall.status = 'Closed';
            contextTargetCall.isCleared = true;
            contextTargetCall.assignedUnits = [];

            if (currentActiveCall && currentActiveCall.id === targetId) {
                resetActiveCallView();
            }

            hideDashboardCallContextMenu();
            renderDashboardCalls();
            checkAndAutoSwitchTab();
        });
    }
});

// ==========================================
// TICKET TAB DATABASE LOOKUPS & ENFORCEMENT
// ==========================================

async function searchDatabaseForPlates(query) {
    const dropdown = document.getElementById('ticket-plate-dropdown');
    if (!dropdown) return;

    if (!query || query.length < 1) {
        dropdown.style.display = 'none';
        return;
    }

    const results = await fetchNui('searchPlate', { query: query }) || [];
    dropdown.innerHTML = '';

    if (results.length === 0) {
        dropdown.innerHTML = '<div style="padding: 8px; color: #94a3b8;">No matching vehicles found</div>';
        dropdown.style.display = 'block';
        return;
    }

    results.forEach(item => {
        const div = document.createElement('div');
        div.style.cssText = 'padding: 8px; cursor: pointer; border-bottom: 1px solid #334155;';
        div.textContent = `${item.plate} - ${item.model || 'Unknown Model'}`;
        div.onmouseover = () => div.style.background = '#334155';
        div.onmouseout = () => div.style.background = 'transparent';
        div.onclick = () => {
            document.getElementById('ticket-plate').value = item.plate;
            document.getElementById('ticket-plate-selected').value = 'true';
            dropdown.style.display = 'none';
        };
        dropdown.appendChild(div);
    });
    dropdown.style.display = 'block';
}
window.searchDatabaseForPlates = searchDatabaseForPlates;

function onPlateInputChanged() {
    document.getElementById('ticket-plate-selected').value = 'false';
    searchDatabaseForPlates(document.getElementById('ticket-plate').value);
}
window.onPlateInputChanged = onPlateInputChanged;

async function searchDatabaseForCitizens(query) {
    const dropdown = document.getElementById('ticket-name-dropdown');
    if (!dropdown) return;

    if (!query || query.length < 1) {
        dropdown.style.display = 'none';
        return;
    }

    const results = await fetchNui('searchCitizen', { query: query }) || [];
    dropdown.innerHTML = '';

    if (results.length === 0) {
        dropdown.innerHTML = '<div style="padding: 8px; color: #94a3b8;">No matching citizens found</div>';
        dropdown.style.display = 'block';
        return;
    }

    results.forEach(item => {
        const div = document.createElement('div');
        div.style.cssText = 'padding: 8px; cursor: pointer; border-bottom: 1px solid #334155;';
        div.textContent = `${item.firstname} ${item.lastname} (DOB: ${item.birthdate || 'N/A'})`;
        div.onmouseover = () => div.style.background = '#334155';
        div.onmouseout = () => div.style.background = 'transparent';
        div.onclick = () => {
            document.getElementById('ticket-name').value = `${item.firstname} ${item.lastname}`;
            document.getElementById('ticket-name-selected').value = 'true';
            dropdown.style.display = 'none';
        };
        dropdown.appendChild(div);
    });
    dropdown.style.display = 'block';
}
window.searchDatabaseForCitizens = searchDatabaseForCitizens;

function onCitizenInputChanged() {
    document.getElementById('ticket-name-selected').value = 'false';
    searchDatabaseForCitizens(document.getElementById('ticket-name').value);
}
window.onCitizenInputChanged = onCitizenInputChanged;


// ==========================================
// REPORTS TAB DATABASE LOOKUPS & ENFORCEMENT
// ==========================================

async function searchDatabaseForReportCitizens(query) {
    const dropdown = document.getElementById('report-suspect-dropdown');
    if (!dropdown) return;

    if (!query || query.length < 1) {
        dropdown.style.display = 'none';
        return;
    }

    const results = await fetchNui('searchCitizen', { query: query }) || [];
    dropdown.innerHTML = '';

    if (results.length === 0) {
        dropdown.innerHTML = '<div style="padding: 8px; color: #94a3b8;">No matching citizens found</div>';
        dropdown.style.display = 'block';
        return;
    }

    results.forEach(item => {
        const div = document.createElement('div');
        div.style.cssText = 'padding: 8px; cursor: pointer; border-bottom: 1px solid #334155;';
        div.textContent = `${item.firstname} ${item.lastname}`;
        div.onmouseover = () => div.style.background = '#334155';
        div.onmouseout = () => div.style.background = 'transparent';
        div.onclick = () => {
            document.getElementById('rep-suspects').value = `${item.firstname} ${item.lastname}`;
            document.getElementById('report-suspect-selected').value = 'true';
            dropdown.style.display = 'none';
        };
        dropdown.appendChild(div);
    });
    dropdown.style.display = 'block';
}
window.searchDatabaseForReportCitizens = searchDatabaseForReportCitizens;

function onReportSuspectInputChanged() {
    document.getElementById('report-suspect-selected').value = 'false';
    searchDatabaseForReportCitizens(document.getElementById('rep-suspects').value);
}
window.onReportSuspectInputChanged = onReportSuspectInputChanged;

async function searchDatabaseForReportPlates(query) {
    const dropdown = document.getElementById('report-vehicle-dropdown');
    if (!dropdown) return;

    if (!query || query.length < 1) {
        dropdown.style.display = 'none';
        return;
    }

    const results = await fetchNui('searchPlate', { query: query }) || [];
    dropdown.innerHTML = '';

    if (results.length === 0) {
        dropdown.innerHTML = '<div style="padding: 8px; color: #94a3b8;">No matching vehicles found</div>';
        dropdown.style.display = 'block';
        return;
    }

    results.forEach(item => {
        const div = document.createElement('div');
        div.style.cssText = 'padding: 8px; cursor: pointer; border-bottom: 1px solid #334155;';
        div.textContent = `${item.plate} - ${item.model || 'Unknown'}`;
        div.onmouseover = () => div.style.background = '#334155';
        div.onmouseout = () => div.style.background = 'transparent';
        div.onclick = () => {
            document.getElementById('rep-vehicles').value = item.plate;
            document.getElementById('report-vehicle-selected').value = 'true';
            dropdown.style.display = 'none';
        };
        dropdown.appendChild(div);
    });
    dropdown.style.display = 'block';
}
window.searchDatabaseForReportPlates = searchDatabaseForReportPlates;

function onReportVehicleInputChanged() {
    document.getElementById('report-vehicle-selected').value = 'false';
    searchDatabaseForReportPlates(document.getElementById('rep-vehicles').value);
}
window.onReportVehicleInputChanged = onReportVehicleInputChanged;


// ==========================================
// SUBMISSION VALIDATION INTERCEPTORS
// ==========================================

async function submitTicketForm(event) {
    event.preventDefault();

    const plate = document.getElementById('ticket-plate').value.trim();
    const name = document.getElementById('ticket-name').value.trim();
    const infraction = document.getElementById('ticket-infraction').value.trim();
    const fine = document.getElementById('ticket-fine').value;
    const notes = document.getElementById('ticket-notes').value.trim();

    if (!name) {
        console.error("Citation Error: Violator name is required.");
        return;
    }

    await fetchNui('sv_cad:server:submitTicket', {
        plate: plate !== '' ? plate : 'N/A',
        name: name,
        infraction: infraction,
        fine: fine,
        notes: notes
    });

    document.getElementById('issue-ticket-form').reset();
    document.getElementById('ticket-plate-selected').value = 'false';
    document.getElementById('ticket-name-selected').value = 'false';
    showTab('dashboard');
}
window.submitTicketForm = submitTicketForm;

async function submitReportForm(event) {
    event.preventDefault();

    const title = document.getElementById('rep-title').value.trim();
    const reportType = document.getElementById('rep-type').value;
    const location = document.getElementById('rep-location').value.trim();
    const suspects = document.getElementById('rep-suspects').value.trim();
    const vehicles = document.getElementById('rep-vehicles').value.trim();
    const vehicleSelected = document.getElementById('report-vehicle-selected').value;
    const summary = document.getElementById('rep-summary').value.trim();

    if (!title || !location || !summary) {
        console.error("Report Error: Title, location, and summary are required.");
        return;
    }

    if (vehicles !== '' && vehicleSelected !== 'true') {
        console.error("Report Error: You must select a valid vehicle plate from the database search dropdown if filled out.");
        return;
    }

    const response = await fetchNui('sv_cad:server:submitReport', {
        title: title,
        reportType: reportType,
        location: location,
        suspects: suspects,
        vehicles: vehicles !== '' ? vehicles : 'N/A',
        summary: summary
    });

    if (response && response.success) {
        document.getElementById('create-report-form').reset();
        document.getElementById('report-suspect-selected').value = 'false';
        document.getElementById('report-vehicle-selected').value = 'false';

        toggleNewReportForm(false);
        fetchFiledReports();
    } else {
        console.error("Failed to submit report to server.");
    }
}
window.submitReportForm = submitReportForm;

function prefillTicketFromLookup(plate = '', citizenName = '') {
    showTab('tickets');
    
    if (citizenName) {
        const nameInput = document.getElementById('ticket-name');
        const nameSelected = document.getElementById('ticket-name-selected');
        if (nameInput) nameInput.value = citizenName;
        if (nameSelected) nameSelected.value = 'true';
    }

    if (plate) {
        const plateInput = document.getElementById('ticket-plate');
        const plateSelected = document.getElementById('ticket-plate-selected');
        if (plateInput) plateInput.value = plate;
        if (plateSelected) plateSelected.value = 'true';
    }
}
window.prefillTicketFromLookup = prefillTicketFromLookup;

function prefillReport(type, value) {
    showTab('reports');
    toggleNewReportForm(true);

    if (type === 'suspect' && value) {
        const suspectInput = document.getElementById('rep-suspects');
        const suspectSelected = document.getElementById('report-suspect-selected');
        if (suspectInput) suspectInput.value = value;
        if (suspectSelected) suspectSelected.value = 'true';
    } else if (type === 'vehicle' && value) {
        const vehicleInput = document.getElementById('rep-vehicles');
        const vehicleSelected = document.getElementById('report-vehicle-selected');
        if (vehicleInput) vehicleInput.value = value;
        if (vehicleSelected) vehicleSelected.value = 'true';
    }
}
window.prefillReport = prefillReport;

async function submitOperatorLogin() {
    const baseUrl = (window.api && window.api.VPS_API_URL) ? window.api.VPS_API_URL : VPS_API_URL;
    const selectEl = document.getElementById('login-operator-select');
    const passwordInput = document.getElementById('login-password-input');
    if (passwordInput) {
        passwordInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                submitOperatorLogin();
            }
        });
    }
    const hintEl = document.getElementById('login-password-hint');

    if (!selectEl || !selectEl.value) return;

    const selectedOp = JSON.parse(selectEl.value);
    const password = passwordInput ? passwordInput.value : '';

    if (selectedOp.callsign !== 'DISPATCH' && !password) {
        if (hintEl) hintEl.textContent = 'Please enter a password.';
        return;
    }

    try {
        const response = await fetch(`${baseUrl}/api/officer/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                callsign: selectedOp.callsign,
                name: selectedOp.name,
                rank: selectedOp.rank,
                password: password
            })
        });

        const result = await response.json();

        if (!result.success) {
            if (hintEl) hintEl.textContent = result.error || 'Invalid password.';
            return;
        }

        localOfficer = {
            callsign: String(selectedOp.callsign),
            name: selectedOp.name,
            rank: selectedOp.rank,
            serverId: selectedOp.id || 999,
            status: 'Available'
        };

        const officerNameEl = document.getElementById('officer-name');
        if (officerNameEl) {
            officerNameEl.textContent = `${localOfficer.callsign} ${localOfficer.name}`;
        }

        const loginModal = document.getElementById('login-modal');
        if (loginModal) {
            loginModal.style.display = 'none';
        }

        const isDispatch = String(localOfficer.callsign).trim().toUpperCase() === 'DISPATCH';
        document.querySelectorAll('.dispatcher-only').forEach(btn => {
            btn.style.display = isDispatch ? 'inline-block' : 'none';
        });

        updateScreenStatusOutline();
        updateFooterBar();
        fetchActiveUnits();
        checkAndAutoSwitchTab();
    } catch (e) {
        console.error("Login request failed:", e);
        if (hintEl) hintEl.textContent = 'Network error connecting to backend.';
    }
}
window.submitOperatorLogin = submitOperatorLogin;

// Dynamic Mode Toggle: Full Suite when CAD is open, Restricted when closed
function setCADMode(isOpen) {
    const navButtons = document.querySelectorAll('.mdt-nav .nav-btn');
    
    navButtons.forEach(btn => {
        // Always keep the close button visible
        if (btn.id === 'close-btn') return;

        const onclickAttr = btn.getAttribute('onclick') || '';
        
        // Define core operational tabs vs advanced utility tabs
        const isCoreTab = onclickAttr.includes('dashboard') || onclickAttr.includes('calls') || onclickAttr.includes('createcall');

        if (isOpen) {
            // When CAD window is open: show all options across the board
            btn.style.display = 'inline-block';
        } else {
            // When CAD window is closed: hide advanced tools, leaving only core tabs
            if (isCoreTab) {
                btn.style.display = 'inline-block';
            } else {
                btn.style.display = 'none';
            }
        }
    });

    // If the window closes while looking at a restricted tab, snap back to dashboard cleanly
    if (!isOpen) {
        const activeTab = document.querySelector('.tab-content.active');
        if (activeTab && activeTab.id !== 'dashboard' && activeTab.id !== 'calls' && activeTab.id !== 'createcall') {
            showTab('dashboard');
        }
    }
}
window.setCADMode = setCADMode;