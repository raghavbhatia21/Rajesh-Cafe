const ordersContainer = document.getElementById('orders-container');
const tablesContainer = document.getElementById('tables-container');

// Local State
let localOrders = {};
let localTables = {};
let localWaiterCalls = {};
let localSettings = { storeName: 'DesignE' };
let orderCountAtInit = null;
let audioEnabled = false;

// Elapsed time helper
function timeElapsed(ts) {
    const diff = Math.floor((Date.now() - ts) / 1000);
    if (diff < 60) return 'Just now';
    if (diff < 3600) return Math.floor(diff / 60) + ' min ago';
    return Math.floor(diff / 3600) + 'h ' + Math.floor((diff % 3600) / 60) + 'm ago';
}

// Update elapsed times every 30s
setInterval(() => {
    document.querySelectorAll('[data-timestamp]').forEach(el => {
        el.innerText = timeElapsed(parseInt(el.dataset.timestamp));
    });
}, 30000);

// Audio notification
function playNotificationSound() {
    if (!audioEnabled) return;
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = 800;
        gain.gain.value = 0.3;
        osc.start();
        osc.stop(ctx.currentTime + 0.15);
        setTimeout(() => {
            const osc2 = ctx.createOscillator();
            osc2.connect(gain);
            osc2.frequency.value = 1200;
            osc2.start();
            osc2.stop(ctx.currentTime + 0.15);
        }, 180);
    } catch (e) { /* ignore audio errors */ }
}

function updateOrderCount() {
    const count = Object.keys(localOrders).length;
    const badge = document.getElementById('order-count-badge');
    if (badge) badge.innerText = count;
}
// --- 1. Efficient Order Sync ---
const ordersRef = db.ref('orders');

ordersRef.on('child_added', (snapshot) => {
    localOrders[snapshot.key] = snapshot.val();
    debouncedRenderOrders();
    updateOrderCount();
    // Play sound for new orders (not on initial load)
    if (orderCountAtInit !== null) playNotificationSound();
});

ordersRef.on('child_changed', (snapshot) => {
    localOrders[snapshot.key] = snapshot.val();
    debouncedRenderOrders();
    updateOrderCount();
});

ordersRef.on('child_removed', (snapshot) => {
    delete localOrders[snapshot.key];
    debouncedRenderOrders();
    updateOrderCount();
});

// After initial load, enable audio
ordersRef.once('value', () => {
    orderCountAtInit = Object.keys(localOrders).length;
});

// Load Store Settings
function loadStoreSettings() {
    db.ref('settings').on('value', snapshot => {
        if (snapshot.exists()) {
            localSettings = { ...localSettings, ...snapshot.val() };
            document.title = `Kitchen Dashboard | ${localSettings.storeName || 'DesignE'}`;
            const logoEl = document.querySelector('.logo');
            if (logoEl) logoEl.innerText = `${localSettings.storeName || 'Kitchen'} Dashboard`;
        }
    });
}
loadStoreSettings();

// Debounce rendering to prevent flicker during rapid updates
let renderOrdersTimeout;
function debouncedRenderOrders() {
    clearTimeout(renderOrdersTimeout);
    renderOrdersTimeout = setTimeout(() => renderOrders(localOrders), 50);
}

function renderOrders(orders) {
    const orderEntries = Object.entries(orders);
    if (orderEntries.length === 0) {
        ordersContainer.innerHTML = `
            <div class="empty-state">
                <p>SYSTEM READY — WAITING FOR ORDERS</p>
            </div>
        `;
        return;
    }

    ordersContainer.innerHTML = '';

    // Sort orders by timestamp (oldest first)
    const sortedOrders = orderEntries.sort((a, b) => a[1].timestamp - b[1].timestamp);

    sortedOrders.forEach(([id, order]) => {
        const orderCard = document.createElement('div');
        orderCard.className = 'order-card';

        const itemsHtml = order.items.map(item => `
            <li class="order-item">
                <span><span class="item-qty">${item.quantity}x</span> ${item.name}</span>
            </li>
        `).join('');

        const elapsed = timeElapsed(order.timestamp);

        orderCard.innerHTML = `
            <div class="order-header">
                <span class="table-no">Table ${order.tableNo}</span>
                <span class="order-time" data-timestamp="${order.timestamp}">${elapsed}</span>
            </div>
            <ul class="order-items">
                ${itemsHtml}
            </ul>
            ${order.comment ? `<div class="order-comment">
                <strong>NOTE:</strong> ${order.comment}
            </div>` : ''}
            <div class="action-grid">
                <button class="btn-main" onclick="completeOrder('${id}')">MARK AS READY</button>
                <button class="btn-outline" onclick="printKOT('${id}')"><i class="fas fa-print"></i> KOT</button>
                <div style="display: flex; gap: 0.5rem; grid-column: 1 / -1;">
                    <button class="btn-outline" style="flex: 1; border-color: rgba(37, 211, 102, 0.3); color: #25D366;" 
                        onclick="sendWhatsAppUpdate('${order.customerPhone}', 'preparing', '${order.tableNo}')">
                        <i class="fab fa-whatsapp"></i> PREPARING
                    </button>
                    <button class="btn-outline" style="flex: 1; border-color: rgba(37, 211, 102, 0.3); color: #25D366;" 
                        onclick="sendWhatsAppUpdate('${order.customerPhone}', 'ready', '${order.tableNo}')">
                        <i class="fab fa-whatsapp"></i> READY
                    </button>
                </div>
            </div>
        `;
        ordersContainer.appendChild(orderCard);
    });
}

// --- 2. Efficient Table Sync ---
const tablesRef = db.ref('tables');

tablesRef.on('child_added', (snapshot) => {
    localTables[snapshot.key] = snapshot.val();
    renderTables(localTables);
});

tablesRef.on('child_changed', (snapshot) => {
    localTables[snapshot.key] = snapshot.val();
    renderTables(localTables);
});

tablesRef.on('child_removed', (snapshot) => {
    delete localTables[snapshot.key];
    renderTables(localTables);
});

function renderTables(tables) {
    const tableEntries = Object.entries(tables);
    tablesContainer.innerHTML = '';

    let hasOccupied = false;
    tableEntries.forEach(([id, data]) => {
        if (data.status === 'occupied') {
            hasOccupied = true;
            const tableCard = document.createElement('div');
            tableCard.className = 'order-card';
            tableCard.style.borderTopColor = 'var(--secondary-glow)';

            const time = new Date(data.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            tableCard.innerHTML = `
                <div class="order-header" style="margin-bottom: 0.5rem;">
                    <span class="table-no" style="font-size: 1.2rem;">${id.replace('table_', 'Table ')}</span>
                    <span class="order-time">${time}</span>
                </div>
                <p style="color: var(--text-dim); font-size: 0.8rem; margin-bottom: 1.5rem; font-weight: 600;">OCCUPIED • ${data.customerName || 'GUEST'}</p>
                <button class="btn-outline" style="width: 100%; border-color: var(--secondary-glow); color: var(--secondary-glow);" onclick="releaseTable('${id}')">RELEASE TABLE</button>
            `;
            tablesContainer.appendChild(tableCard);
        }
    });

    if (!hasOccupied) {
        tablesContainer.innerHTML = `
            <div class="empty-state" style="padding: 2rem;">
                <p style="font-size: 0.7rem; letter-spacing: 1px;">ALL TABLES ARE CURRENTLY VACANT</p>
            </div>
        `;
    }
}

// --- 3. Efficient Waiter Call Sync ---
const waiterCallsRef = db.ref('waiter_calls');
const waiterCallsArea = document.getElementById('waiter-calls-area');

if (waiterCallsArea) {
    waiterCallsRef.on('child_added', (snapshot) => {
        localWaiterCalls[snapshot.key] = snapshot.val();
        renderWaiterCalls(localWaiterCalls);
    });

    waiterCallsRef.on('child_changed', (snapshot) => {
        localWaiterCalls[snapshot.key] = snapshot.val();
        renderWaiterCalls(localWaiterCalls);
    });

    waiterCallsRef.on('child_removed', (snapshot) => {
        delete localWaiterCalls[snapshot.key];
        renderWaiterCalls(localWaiterCalls);
    });
}

function renderWaiterCalls(calls) {
    const callEntries = Object.entries(calls);
    if (callEntries.length === 0) {
        waiterCallsArea.classList.remove('active');
        waiterCallsArea.innerHTML = '';
        return;
    }

    waiterCallsArea.classList.add('active');
    waiterCallsArea.innerHTML = '';

    callEntries.forEach(([id, call]) => {
        const time = new Date(call.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const card = document.createElement('div');
        card.className = 'waiter-card glass';
        card.innerHTML = `
            <h4>Table ${call.tableNo}</h4>
            <p><i class="fas fa-user"></i> ${call.customerName}</p>
            <p><i class="far fa-clock"></i> ${time}</p>
            <button class="resolve-btn" onclick="resolveWaiterCall('${id}')">RESOLVED / CLEAR</button>
        `;
        waiterCallsArea.appendChild(card);
    });
}

// --- 4. Shared Actions ---
window.completeOrder = (id) => {
    if (confirm('Mark this order as complete?')) {
        firebase.database().ref('orders/' + id).remove();
    }
};

window.releaseTable = (tableId) => {
    if (confirm(`Release ${tableId.replace('_', ' ')}? This will allow new customers to use it.`)) {
        firebase.database().ref('tables/' + tableId).update({
            status: 'free',
            sessionId: null
        });
    }
};

window.resolveWaiterCall = (id) => {
    firebase.database().ref('waiter_calls/' + id).remove();
};

window.sendWhatsAppUpdate = (phone, status, tableNo) => {
    if (!phone) {
        alert("No phone number associated with this order.");
        return;
    }

    let message = "";
    const storeName = localSettings.storeName || "DesignE";
    if (status === 'preparing') {
        message = `👨‍🍳 *Update from ${storeName}!*\n\nTable: ${tableNo}\nYour order is now being *prepared* in the kitchen. Just a few more minutes!`;
    } else if (status === 'ready') {
        message = `✅ *Update from ${storeName}!*\n\nTable: ${tableNo}\nGood news! Your order is *ready* and will be served shortly. Bon appétit! 🍽️`;
    }

    if (message) {
        const waUrl = `https://wa.me/91${phone.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`;
        window.open(waUrl, '_blank');
    }
};

// Enable audio toggle
window.toggleAudio = () => {
    audioEnabled = !audioEnabled;
    const btn = document.getElementById('audio-toggle-btn');
    if (btn) {
        btn.innerHTML = audioEnabled
            ? '<i class="fas fa-volume-up"></i>'
            : '<i class="fas fa-volume-mute"></i>';
    }
};

// --- KOT Print (Hidden Iframe Method) ---
window.printKOT = (orderId) => {
    const order = localOrders[orderId];
    if (!order) { alert('Order not found.'); return; }

    const now = new Date();
    const dateStr = now.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const timeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

    const itemRows = (order.items || []).map(item =>
        `<tr><td>${item.name}</td><td style="text-align:center;font-weight:bold;">${item.quantity}</td></tr>`
    ).join('');

    const kotHtml = `
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            @page { margin: 5mm; size: auto; }
            body { margin: 0; padding: 0; font-family: 'Courier New', Courier, monospace; width: 100%; font-size: 14px; }
            .receipt { width: 100%; max-width: 100%; box-sizing: border-box; }
            .center { text-align: center; margin-bottom: 10px; }
            .center h1 { font-size: 20px; margin: 0; letter-spacing: 2px; }
            hr { border: none; border-top: 1px dashed black; margin: 10px 0; }
            .info { display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 5px; gap: 10px; }
            table { width: 100%; border-collapse: collapse; margin: 10px 0; }
            td { padding: 5px 0; vertical-align: top; }
            th { text-align: left; border-bottom: 1px solid black; padding-bottom: 5px; font-size: 12px; }
            .note { margin-top: 10px; padding: 5px; border: 1px solid black; font-size: 11px; font-style: italic; }
            .footer { text-align: center; margin-top: 20px; font-size: 10px; border-top: 1px solid black; padding-top: 5px; }
        </style>
    </head>
    <body onload="window.print()">
        <div class="receipt">
            <div class="center">
                <h1>KOT</h1>
                <p style="margin: 2px 0;">DESIGNE</p>
            </div>
            <hr>
            <div class="info"><span>Table: <strong>${order.tableNo}</strong></span><span>${dateStr}</span></div>
            <div class="info"><span>Order: #${orderId.substr(-6).toUpperCase()}</span><span>${timeStr}</span></div>
            <hr>
            <table>
                <thead><tr><th>ITEM</th><th style="text-align:center;">QTY</th></tr></thead>
                <tbody>${itemRows}</tbody>
            </table>
            <hr>
            ${order.comment ? `<div class="note"><strong>Note:</strong> ${order.comment}</div>` : ''}
            <div class="footer">--- Kitchen Copy ---</div>
        </div>
    </body>
    </html>`;

    // Remove any existing print frame
    const oldFrame = document.getElementById('kot-print-frame');
    if (oldFrame) oldFrame.remove();

    // Create new hidden iframe
    const iframe = document.createElement('iframe');
    iframe.id = 'kot-print-frame';
    iframe.style.position = 'absolute';
    iframe.style.width = '0px';
    iframe.style.height = '0px';
    iframe.style.border = 'none';
    iframe.srcdoc = kotHtml;

    document.body.appendChild(iframe);
};

// --- Connection Optimization ---
// Automatically disconnects from Firebase when the tab is hidden to save connections.
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
        console.log('[Firebase] Kitchen Tab hidden. Conserving connections...');
        firebase.database().goOffline();
        if (typeof saasDb !== 'undefined') saasDb.goOffline();
    } else {
        console.log('[Firebase] Kitchen Tab active. Restoring connections...');
        firebase.database().goOnline();
        if (typeof saasDb !== 'undefined') saasDb.goOnline();
    }
});

