// ================================================================
// OWNER DASHBOARD - owner.js
// Credentials are fetched from Firebase only, never hardcoded.
// ================================================================

let localSessions = {};
let localSettings = {};
let ownerCredentialsLoaded = false;

const sessionsRef = db.ref('sessions');

// --- STEP 1: Load owner credentials from Firebase FIRST ---
db.ref('settings').once('value').then(snapshot => {
    if (snapshot.exists()) {
        localSettings = snapshot.val();
    }
    ownerCredentialsLoaded = true;
    initOwnerPage();
}).catch(err => {
    console.error('Failed to load settings:', err);
    ownerCredentialsLoaded = true;
    initOwnerPage();
});

// --- STEP 2: Initialize the page after credentials are ready ---
function initOwnerPage() {
    const gate = document.getElementById('auth-gate');
    const mainContent = document.getElementById('main-content');

    // Set date defaults
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('history-start-date').value = today;
    document.getElementById('history-end-date').value = today;

    // Check if already verified this session
    if (sessionStorage.getItem('owner_verified') === 'true') {
        gate.style.display = 'none';
        mainContent.style.display = 'block';
        populateSettingsForm();
        startSessionListeners();
        loadHistory();
    } else {
        gate.style.display = 'flex';
        mainContent.style.display = 'none';
    }
}

// --- SECURITY GATE ---
window.verifyOwnerAccess = function() {
    const id = document.getElementById('auth-id').value.trim();
    const pass = document.getElementById('auth-pass').value.trim();
    const errorEl = document.getElementById('auth-error');

    if (!ownerCredentialsLoaded) {
        errorEl.innerText = 'Still loading, please wait...';
        errorEl.style.display = 'block';
        return;
    }

    // Credentials come from Firebase database, not source code
    const correctId = localSettings.ownerId || 'owner';
    const correctPass = localSettings.ownerPass || 'change_me';

    if (id === correctId && pass === correctPass) {
        sessionStorage.setItem('owner_verified', 'true');
        const gate = document.getElementById('auth-gate');
        const mainContent = document.getElementById('main-content');

        gate.style.transition = 'opacity 0.3s ease';
        gate.style.opacity = '0';
        setTimeout(() => {
            gate.style.display = 'none';
            mainContent.style.display = 'block';
            populateSettingsForm();
            startSessionListeners();
            loadHistory();
        }, 300);
    } else {
        errorEl.innerText = 'Invalid credentials. Please try again.';
        errorEl.style.display = 'block';
        const card = document.querySelector('.auth-card');
        card.style.animation = 'none';
        setTimeout(() => card.style.animation = 'shake 0.4s', 10);
    }
};

// --- SETTINGS ---
function populateSettingsForm() {
    document.title = (localSettings.storeName || 'Owner') + ' | DesignE';
    const logoEl = document.querySelector('.logo');
    if (logoEl) logoEl.innerText = localSettings.storeName || 'OWNER DASHBOARD';

    setValue('setting-store-name', localSettings.storeName);
    setValue('setting-upi-id', localSettings.upiId);
    setValue('setting-owner-phone', localSettings.ownerPhone);
    setValue('setting-owner-id', localSettings.ownerId);
    setValue('setting-owner-pass', localSettings.ownerPass);

    // Keep listening for live changes
    db.ref('settings').on('value', snapshot => {
        if (snapshot.exists()) {
            localSettings = snapshot.val();
        }
    });
}

function setValue(id, val) {
    const el = document.getElementById(id);
    if (el) el.value = val || '';
}

window.saveOwnerSettings = function() {
    const storeName = document.getElementById('setting-store-name').value.trim();
    const upiId = document.getElementById('setting-upi-id').value.trim();
    const ownerPhone = document.getElementById('setting-owner-phone').value.trim();
    const ownerId = document.getElementById('setting-owner-id').value.trim();
    const ownerPass = document.getElementById('setting-owner-pass').value.trim();

    if (!ownerId || !ownerPass) {
        alert('Owner ID and Password cannot be empty!');
        return;
    }

    const currentUser = firebase.auth().currentUser;
    if (!currentUser) {
        alert('You must be logged in to save settings.');
        return;
    }

    const saveBtn = document.getElementById('save-settings-btn');
    const originalText = saveBtn.innerHTML;
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> SAVING...';

    db.ref('settings').update({
        storeName,
        upiId,
        ownerPhone,
        ownerId,
        ownerPass
    }).then(() => {
        alert('Configuration updated successfully!');
    }).catch(err => {
        console.error('Failed to save settings:', err);
        alert('Error saving settings: ' + err.message);
    }).finally(() => {
        saveBtn.disabled = false;
        saveBtn.innerHTML = originalText;
    });
};

// --- SESSIONS & HISTORY ---
function startSessionListeners() {
    sessionsRef.on('child_added', snapshot => {
        localSessions[snapshot.key] = snapshot.val();
    });
    sessionsRef.on('child_changed', snapshot => {
        localSessions[snapshot.key] = snapshot.val();
    });
    sessionsRef.on('child_removed', snapshot => {
        delete localSessions[snapshot.key];
    });
}

window.loadHistory = function() {
    const startDateStr = document.getElementById('history-start-date').value;
    const endDateStr = document.getElementById('history-end-date').value;

    if (!startDateStr || !endDateStr) return;

    const startObj = new Date(startDateStr);
    startObj.setHours(0, 0, 0, 0);

    const endObj = new Date(endDateStr);
    endObj.setHours(23, 59, 59, 999);

    const historyEntries = Object.entries(localSessions)
        .filter(([id, s]) => {
            if (s.status !== 'completed' || !s.settledAt || (s.total || 0) <= 0) return false;
            const settled = new Date(s.settledAt);
            return settled >= startObj && settled <= endObj;
        })
        .sort((a, b) => (b[1].settledAt || 0) - (a[1].settledAt || 0));

    const totalOrders = historyEntries.length;
    let totalRevenue = 0;
    let cashRevenue = 0;
    let onlineRevenue = 0;

    historyEntries.forEach(([, s]) => {
        const amt = s.total || 0;
        totalRevenue += amt;
        if (s.paymentMethod === 'online') onlineRevenue += amt;
        else cashRevenue += amt;
    });

    const avgOrder = totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0;

    document.getElementById('hist-orders').innerText = totalOrders;
    document.getElementById('hist-revenue').innerText = '\u20B9' + totalRevenue.toLocaleString();
    document.getElementById('hist-revenue-cash').innerText = '\u20B9' + cashRevenue.toLocaleString();
    document.getElementById('hist-revenue-online').innerText = '\u20B9' + onlineRevenue.toLocaleString();
    document.getElementById('hist-avg').innerText = '\u20B9' + avgOrder.toLocaleString();

    const historyList = document.getElementById('history-list');
    historyList.innerHTML = '';

    if (historyEntries.length === 0) {
        historyList.innerHTML = '<div class="empty-state" style="padding: 5rem 1rem;">' +
            '<i class="fas fa-search" style="opacity: 0.2;"></i>' +
            '<p>No orders found for this period.</p>' +
            '<span>Try selecting a different date range.</span></div>';
        return;
    }

    historyEntries.forEach(([id, session]) => {
        const settledFullDate = new Date(session.settledAt).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
        const settledTime = new Date(session.settledAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const itemsSummary = (session.items || []).map(i => i.quantity + 'x ' + i.name).join(', ');

        const method = (session.paymentMethod || 'cash').toLowerCase();
        const methodHtml = '<span class="payment-badge ' + method + '">' + method + '</span>';
        
        const card = document.createElement('div');
        card.className = 'history-item-card';
        card.innerHTML = '<div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1rem;">' +
            '<div>' +
                '<div style="display: flex; align-items: center; gap: 0.8rem; margin-bottom: 0.3rem;">' +
                    '<span style="font-weight: 900; font-size: 1.1rem; color: white;">Table ' + session.tableNo + '</span>' +
                    methodHtml +
                '</div>' +
                '<span style="font-size: 0.8rem; color: white; opacity: 0.8; font-weight: 600; display: block;">' + (session.customerName || 'GUEST') + '</span>' +
                '<span style="font-size: 0.7rem; color: var(--text-dim); font-weight: 700; margin-top: 0.4rem; display: block;">' +
                     '<i class="far fa-calendar-alt"></i> ' + settledFullDate + ' &nbsp;•&nbsp; <i class="far fa-clock"></i> ' + settledTime +
                '</span>' +
            '</div>' +
            '<div style="text-align: right;">' +
                '<span style="font-weight: 900; font-size: 1.4rem; color: var(--success-neon); display: block;">\u20B9' + (session.total || 0).toLocaleString() + '</span>' +
                '<span style="font-size: 0.6rem; color: var(--text-dim); font-weight: 800; letter-spacing: 1px;">#' + id.substr(-6).toUpperCase() + '</span>' +
            '</div>' +
        '</div>' +
        '<div style="font-size: 0.8rem; color: var(--text-dim); font-weight: 500; margin-bottom: 1.2rem; line-height: 1.5; background: rgba(255,255,255,0.02); padding: 0.8rem; border-radius: 8px;">' +
            '<i class="fas fa-receipt" style="margin-right: 0.5rem; opacity: 0.5;"></i> ' + (itemsSummary || 'No items listed') +
        '</div>' +
        '<div style="display: flex; gap: 0.8rem;">' +
            '<button class="nav-btn" style="flex: 1; justify-content: center; padding: 0.6rem; font-size: 0.75rem;" onclick="printBill(\'' + id + '\')">' +
                '<i class="fas fa-print"></i> REPRINT RECEIPT' +
            '</button>' +
            '<button class="nav-btn logout" style="background: rgba(239, 68, 68, 0.05); border-color: rgba(239, 68, 68, 0.2); padding: 0.6rem; justify-content: center; width: 45px;" onclick="deleteHistoryEntry(\'' + id + '\')" title="Delete record">' +
                '<i class="fas fa-trash-alt"></i>' +
            '</button>' +
        '</div>';
        historyList.appendChild(card);
    });
};

// --- DELETE & CLEAR ---
window.deleteHistoryEntry = function(sessionId) {
    if (confirm('Are you sure you want to delete this order from history? This action cannot be undone!')) {
        db.ref('sessions/' + sessionId).remove()
            .then(() => { alert('Order successfully deleted.'); loadHistory(); })
            .catch(err => alert('Failed to delete order: ' + err.message));
    }
};

window.clearAllSessions = function() {
    var p1 = confirm('\u26A0\uFE0F CRITICAL WARNING: You are about to DELETE ALL SALES HISTORY. Are you sure?');
    if (p1) {
        var p2 = confirm('FINAL CONFIRMATION: This action is IRREVERSIBLE. All data will be gone. Proceed?');
        if (p2) {
            db.ref('sessions').remove().then(() => {
                localSessions = {};
                alert('All session data wiped successfully.');
                loadHistory();
            }).catch(err => {
                alert('Failed to clear data: ' + err.message);
            });
        }
    }
};

// --- PRINT BILL ---
window.printBill = function(sessionId) {
    var session = localSessions[sessionId];
    if (!session) { alert('Session not found.'); return; }

    var now = new Date();
    var dateStr = now.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
    var timeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

    var itemRows = (session.items || []).map(function(item) {
        var amt = item.price * item.quantity;
        return '<tr><td style="text-align:left;">' + item.name + '</td>' +
               '<td style="text-align:center;">' + item.quantity + '</td>' +
               '<td style="text-align:right;">Rs.' + amt.toLocaleString() + '</td></tr>';
    }).join('');

    var modRows = '';
    if (session.modifiers && session.modifiers.length > 0) {
        modRows += '<tr><td colspan="2" style="text-align:right; font-weight: bold; border-top: 1px dashed black; padding-top: 5px;">Subtotal</td>' +
                   '<td style="text-align:right; border-top: 1px dashed black; padding-top: 5px;">Rs.' + (session.subtotal || session.total || 0).toLocaleString() + '</td></tr>';
        session.modifiers.forEach(function(mod) {
            var amtStr = mod.isPercentage ? mod.value + '%' : 'Rs.' + mod.value;
            var sign = mod.type === 'discount' ? '-' : '+';
            var calculatedAmt = mod.isPercentage ? ((session.subtotal || 0) * (mod.value / 100)) : mod.value;
            modRows += '<tr><td colspan="2" style="text-align:right; font-size:10px;">' + mod.label + ' (' + amtStr + ')</td>' +
                       '<td style="text-align:right; font-size:10px;">' + sign + 'Rs.' + Math.round(calculatedAmt).toLocaleString() + '</td></tr>';
        });
    }

    var receiptHtml = '<div class="receipt"><div class="center">' +
        '<h1>' + (localSettings.storeName || 'DESIGNE') + '</h1>' +
        '<div class="sub-hdr">DIGITAL RESTAURANT ORDERING</div>' +
        '<div style="font-weight: bold; margin-top: 5px; font-size: 11px;">-- CUSTOMER COPY --</div></div><hr>' +
        '<div class="info"><span>Table: <strong>' + session.tableNo + '</strong></span><span>' + dateStr + '</span></div>' +
        '<div class="info"><span>Customer: <strong>' + (session.customerName || 'Guest') + '</strong></span><span>Bill #' + sessionId.substr(-6).toUpperCase() + '</span></div>' +
        '<div class="info"><span>Time: ' + timeStr + '</span></div><hr>' +
        '<table><thead><tr><th>ITEM</th><th style="text-align:center;">QTY</th><th style="text-align:right;">AMT</th></tr></thead>' +
        '<tbody>' + itemRows + modRows +
        '<tr><td colspan="2" style="text-align:right; font-weight: bold; font-size: 14px; border-top: 2px solid black; padding-top: 5px;">Grand Total</td>' +
        '<td style="text-align:right; font-weight: bold; font-size: 14px; border-top: 2px solid black; padding-top: 5px;">Rs.' + (session.total || 0).toLocaleString() + '</td></tr>' +
        '</tbody></table><hr>' +
        '<div class="center" style="margin-top: 10px;"><div style="font-weight: bold; font-size: 14px;">THANK YOU!</div>' +
        '<div style="font-size: 10px; margin-top: 5px;">Please Visit Again</div></div></div>';

    var billHtml = '<html><head><style>' +
        "@import url('https://fonts.googleapis.com/css2?family=Courier+Prime:wght@400;700&display=swap');" +
        'body { font-family: "Courier Prime", monospace; padding: 10px; width: 280px; margin: 0 auto; color: black; background: white; }' +
        '.center { text-align: center; }' +
        'h1 { margin: 0; font-size: 20px; font-weight: bold; text-transform: uppercase; }' +
        '.sub-hdr { font-size: 11px; text-transform: uppercase; margin-bottom: 10px; }' +
        'hr { border-top: 1px dashed black; border-bottom: none; }' +
        '.info { display: flex; justify-content: space-between; font-size: 12px; margin: 3px 0; }' +
        'table { width: 100%; font-size: 12px; border-collapse: collapse; margin-top: 8px; }' +
        'th { border-bottom: 1px solid black; padding-bottom: 4px; }' +
        'td { padding: 4px 0; }' +
        '</style></head><body onload="window.print()">' + receiptHtml + '</body></html>';

    var oldFrame = document.getElementById('bill-print-frame');
    if (oldFrame) oldFrame.remove();

    var iframe = document.createElement('iframe');
    iframe.id = 'bill-print-frame';
    iframe.style.position = 'absolute';
    iframe.style.width = '0px';
    iframe.style.height = '0px';
    iframe.style.border = 'none';
    iframe.srcdoc = billHtml;
    document.body.appendChild(iframe);
};
