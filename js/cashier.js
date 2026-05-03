const billsContainer = document.getElementById('bills-container');

// Local State
let localSessions = {};
let localWaiterCalls = {};
let localSettings = {
    storeName: 'DesignE',
    upiId: 'raghavbhatia332@okhdfcbank',
    ownerPhone: '',
    tableLimit: 20
};

// Daily Stats
function updateDailyStats() {
    const todayStr = new Date().toLocaleDateString();
    const entries = Object.entries(localSessions);

    let totalRevenue = 0;
    let cashRevenue = 0;
    let onlineRevenue = 0;
    let activeBillsCount = 0;

    entries.forEach(([id, d]) => {
        const isCurrentActive = d.status === 'active' || d.status === 'bill_requested';
        const isSettleToday = d.status === 'completed' && d.settledAt && new Date(d.settledAt).toLocaleDateString() === todayStr;

        if (isCurrentActive || isSettleToday) {
            const billTotal = d.total || 0;
            if (billTotal > 0) {
                totalRevenue += billTotal;
                if (isSettleToday) {
                    if (d.paymentMethod === 'online') onlineRevenue += billTotal;
                    else cashRevenue += billTotal;
                }
                if (isCurrentActive) activeBillsCount++;
            }
        }
    });

    const countEl = document.getElementById('active-bills-count');
    const revenueEl = document.getElementById('daily-revenue');
    const cashEl = document.getElementById('daily-revenue-cash');
    const onlineEl = document.getElementById('daily-revenue-online');

    if (countEl) countEl.innerText = activeBillsCount;
    if (revenueEl) revenueEl.innerText = '₹' + totalRevenue.toLocaleString();
    if (cashEl) cashEl.innerText = '₹' + cashRevenue.toLocaleString();
    if (onlineEl) onlineEl.innerText = '₹' + onlineRevenue.toLocaleString();
}

// --- 1. Efficient Session Sync ---
const sessionsRef = db.ref('sessions');

sessionsRef.on('child_added', (snapshot) => {
    localSessions[snapshot.key] = snapshot.val();
    renderBills(localSessions);
    updateDailyStats();
});

sessionsRef.on('child_changed', (snapshot) => {
    localSessions[snapshot.key] = snapshot.val();
    renderBills(localSessions);
    updateDailyStats();
});

sessionsRef.on('child_removed', (snapshot) => {
    delete localSessions[snapshot.key];
    renderBills(localSessions);
    updateDailyStats();
});

function renderBills(sessions) {
    const sessionEntries = Object.entries(sessions);
    if (sessionEntries.length === 0) {
        showEmptyState();
        return;
    }

    const activeSessions = sessionEntries
        .filter(([id, data]) => data.status === 'active' || data.status === 'bill_requested')
        .sort((a, b) => (b[1].lastOrderTime || 0) - (a[1].lastOrderTime || 0));

    if (activeSessions.length === 0) {
        showEmptyState();
        return;
    }

    billsContainer.innerHTML = '';

    activeSessions.forEach(([id, session]) => {
        const isRequested = session.status === 'bill_requested';
        const billCard = document.createElement('div');
        billCard.className = `bill-card ${isRequested ? 'pulse-border' : ''}`;

        const itemsHtml = (session.items || []).map(item => `
            <li class="bill-item">
                <span><span class="item-qty">${item.quantity}x</span> ${item.name}</span>
                <span>₹${item.price * item.quantity}</span>
            </li>
        `).join('');

        const itemsString = (session.items || []).map(i => `${i.quantity}x ${i.name}`).join(', ');

        let modifiersHtml = '';
        if (session.modifiers && Array.isArray(session.modifiers) && session.modifiers.length > 0) {
            modifiersHtml += `<div style="border-top: 1px dashed rgba(255,255,255,0.05); margin-bottom: 0.8rem; padding-top: 0.8rem;">
                <div style="display: flex; justify-content: space-between; font-size: 0.75rem; color: var(--text-dim); margin-bottom: 0.3rem; font-weight: 600;">
                    <span>SUBTOTAL:</span>
                    <span>₹${(session.subtotal || session.total || 0).toLocaleString()}</span>
                </div>`;
            session.modifiers.forEach((mod, idx) => {
                const amtStr = mod.isPercentage ? `${mod.value}%` : `₹${mod.value}`;
                const sign = mod.type === 'discount' ? '−' : '+';
                const calculatedAmt = mod.isPercentage ? ((session.subtotal || 0) * (mod.value / 100)) : mod.value;
                const color = mod.type === 'discount' ? 'var(--secondary-glow)' : 'var(--primary-glow)';
                modifiersHtml += `
                <div style="display: flex; justify-content: space-between; font-size: 0.75rem; padding: 0.1rem 0; color: ${color}; font-weight: 700;">
                    <span>${mod.label.toUpperCase()} (${amtStr}) <i class="fas fa-times-circle" style="cursor:pointer; margin-left:5px;" onclick="removeModifier('${id}', ${idx})"></i></span>
                    <span>${sign}₹${Math.round(calculatedAmt).toLocaleString()}</span>
                </div>`;
            });
            modifiersHtml += `</div>`;
        }

        billCard.innerHTML = `
            <div class="order-header">
                <div>
                    <span class="table-no">Table ${session.tableNo}</span>
                    <div style="font-size: 0.8rem; color: var(--text-dim); font-weight: 700; margin-top: 0.2rem; text-transform: uppercase;">${session.customerName || 'GUEST'}</div>
                </div>
                <div style="text-align: right;">
                    <span style="font-size: 0.65rem; color: var(--text-dim); font-weight: 800; display: block; letter-spacing: 1px;">#${id.substr(-6).toUpperCase()}</span>
                    ${isRequested ? '<span style="font-size: 0.6rem; background: var(--primary-glow); color: black; padding: 0.1rem 0.4rem; border-radius: 4px; font-weight: 900; margin-top: 0.3rem; display: inline-block;">BILL REQ</span>' : ''}
                </div>
            </div>
            <ul class="bill-items">
                ${itemsHtml || '<li class="bill-item">No items yet</li>'}
            </ul>
            ${session.comment ? `<div class="order-comment">
                <strong>NOTE:</strong> ${session.comment}
            </div>` : ''}
            <div class="bill-footer">
                ${modifiersHtml}
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem;">
                    <span style="font-size: 0.75rem; font-weight: 800; color: var(--text-dim);">GRAND TOTAL:</span>
                    <span style="font-size: 1.8rem; font-weight: 900; color: white; line-height: 1;">₹${(session.total || 0).toLocaleString()}</span>
                </div>
                
                <button class="nav-btn" style="width: 100%; justify-content: center; margin-bottom: 1rem; border-style: dashed; font-size: 0.7rem;" onclick="openModifierModal('${id}')">
                   <i class="fas fa-plus-circle"></i> ADD CHARGE / DISCOUNT
                </button>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.8rem; margin-bottom: 1rem;">
                    <button class="paid-btn" style="background: var(--success-neon); color: black;" onclick="markAsPaid('${id}', '${session.tableNo}', 'cash')"><i class="fas fa-money-bill-wave"></i> CASH</button>
                    <button class="paid-btn" style="background: var(--primary-glow); color: black;" onclick="markAsPaid('${id}', '${session.tableNo}', 'online')"><i class="fas fa-qrcode"></i> ONLINE</button>
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0.5rem;">
                    <button class="nav-btn" style="flex: 1; justify-content: center; padding: 0.5rem;" onclick="sendBillWhatsApp('${itemsString.replace(/'/g, "\\'")}', '${session.total}', '${session.tableNo}', '${session.customerPhone || ''}', '${id.substr(-6).toUpperCase()}', '${(session.customerName || 'Guest').replace(/'/g, "\\'")}', '${id}')">
                        <i class="fab fa-whatsapp"></i>
                    </button>
                    <button class="nav-btn" style="flex: 1; justify-content: center; padding: 0.5rem;" onclick="showPaymentQR('${session.total}', '${session.tableNo}')">
                        <i class="fas fa-qrcode"></i>
                    </button>
                    <button class="nav-btn" style="flex: 1; justify-content: center; padding: 0.5rem;" onclick="printBill('${id}')">
                        <i class="fas fa-print"></i>
                    </button>
                </div>
            </div>
        `;
        billsContainer.appendChild(billCard);
    });
}

function showEmptyState() {
    billsContainer.innerHTML = `
        <div class="empty-state">
            <i class="fas fa-receipt"></i>
            <p>No active bills found.</p>
            <span>New orders will appear here automatically.</span>
        </div>
    `;
}

window.markAsPaid = (sessionId, tableNo, method) => {
    if (confirm(`Confirm payment of Table ${tableNo} via ${method.toUpperCase()}? This will free the table.`)) {
        // 1. Free the Table
        db.ref('tables/table_' + tableNo).update({
            status: 'free',
            sessionId: null
        }).then(() => {
            // 2. Update the Session to 'completed' instead of removing it
            // This preserves the revenue data for the dashboard
            db.ref('sessions/' + sessionId).update({
                status: 'completed',
                settledAt: Date.now(),
                paymentMethod: method
            }).then(() => {
                // 3. Cleanup Orders associated with this session (optional, but keeps 'orders' node clean)
                db.ref('orders').once('value', snapshot => {
                    const orders = snapshot.val();
                    if (orders) {
                        Object.entries(orders).forEach(([id, order]) => {
                            if (order.sessionId === sessionId) {
                                db.ref('orders/' + id).remove();
                            }
                        });
                    }
                });

                // 4. Cleanup Waiter Calls associated with this session
                db.ref('waiter_calls').once('value', snapshot => {
                    const calls = snapshot.val();
                    if (calls) {
                        Object.entries(calls).forEach(([id, call]) => {
                            if (call.sessionId === sessionId) {
                                db.ref('waiter_calls/' + id).remove();
                            }
                        });
                    }
                });

                alert(`Table ${tableNo} settled successfully!`);
            });
        }).catch(err => {
            console.error("Error during cleanup:", err);
            alert("Settlement failed. Please check connection.");
        });
    }
};

window.sendBillWhatsApp = (items, total, tableNo, phone, orderId, customerName, sessionId) => {
    if (!phone) {
        alert("Phone number not found for this session.");
        return;
    }

    const baseUrl = window.location.origin + window.location.pathname.split('/').slice(0, -2).join('/');
    const paymentUrl = `${baseUrl}/pay.html?sid=${sessionId}`;

    const message = `🧾 *Bill from DesignE*\n\nCustomer: ${customerName}\nOrder ID: #${orderId}\nTable: ${tableNo}\nItems: ${items}\n-------------------\nTotal: *₹${total}*\n-------------------\n\n🔗 *Pay Online:* ${paymentUrl}\n\nThank you for visiting, ${customerName}! ✨`;

    const waUrl = `https://wa.me/91${phone.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`;
    window.open(waUrl, '_blank');
};

window.showPaymentQR = (total, tableNo) => {
    const upiId = localSettings.upiId || "raghavbhatia332@okhdfcbank";
    const name = localSettings.storeName || "DesignE";
    const upiLink = `upi://pay?pa=${upiId}&pn=${encodeURIComponent(name)}&am=${total}&cu=INR&tn=${encodeURIComponent('Table ' + tableNo)}`;
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(upiLink)}`;

    const modal = document.createElement('div');
    modal.style = "position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); display: flex; align-items: center; justify-content: center; z-index: 10000; flex-direction: column; color: white;";
    modal.innerHTML = `
        <div style="background: white; padding: 2rem; border-radius: 15px; text-align: center; color: black; max-width: 300px;">
            <h3 style="margin-bottom: 1rem;">Table ${tableNo} Payment</h3>
            <img src="${qrUrl}" alt="Payment QR" style="width: 200px; height: 200px; margin-bottom: 1rem;">
            <p style="font-weight: bold; font-size: 1.2rem;">Total: ₹${total}</p>
            <p style="font-size: 0.8rem; color: #666; margin-top: 0.5rem;">Scan with any UPI App (PhonePe, GPay, etc.)</p>
            <button onclick="this.parentElement.parentElement.remove()" style="margin-top: 1.5rem; padding: 0.5rem 2rem; background: var(--accent-main); color: white; border: none; border-radius: 5px; cursor: pointer;">CLOSE</button>
        </div>
    `;
    document.body.appendChild(modal);
};

// --- 2. Efficient Waiter Call Sync ---
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

window.resolveWaiterCall = (id) => {
    db.ref('waiter_calls/' + id).remove();
};

// Store Settings Management
function loadStoreSettings() {
    db.ref('settings').on('value', snapshot => {
        if (snapshot.exists()) {
            localSettings = { ...localSettings, ...snapshot.val() };
            
            // Update UI elements that depend on settings
            document.title = `${localSettings.storeName || 'Cashier'} | DesignE`;
            const logoEl = document.querySelector('.logo');
            if (logoEl) logoEl.innerText = localSettings.storeName || 'Cash Counter';

            // Populate Modal Fields (if modal exists)
            const limitInput = document.getElementById('setting-table-limit');
            if (limitInput) limitInput.value = localSettings.tableLimit || 20;

            // Refresh floor map if limit changed
            renderFloorMap();
        }
    });
}

window.openStoreSettingsModal = () => {
    document.getElementById('store-settings-modal').classList.add('active');
};

window.closeStoreSettingsModal = () => {
    document.getElementById('store-settings-modal').classList.remove('active');
};

window.saveStoreSettings = () => {
    const tableLimit = parseInt(document.getElementById('setting-table-limit').value);

    // Auth Check
    const currentUser = firebase.auth().currentUser;
    if (!currentUser) {
        alert("You must be logged in to save settings.");
        return;
    }

    if (!tableLimit || tableLimit < 1) {
        alert("Please enter a valid table limit.");
        return;
    }

    const saveBtn = document.getElementById('save-settings-btn');
    const originalText = saveBtn.innerText;
    saveBtn.disabled = true;
    saveBtn.innerText = 'SAVING...';

    db.ref('settings').update({
        tableLimit
    }).then(() => {
        alert("Settings updated successfully!");
        closeStoreSettingsModal();
    }).catch(err => {
        console.error("Failed to save settings:", err);
        alert(`Error saving settings: ${err.message}`);
    }).finally(() => {
        saveBtn.disabled = false;
        saveBtn.innerText = originalText;
    });
};



// --- Feature 2: Daily Sales Summary via WhatsApp ---
window.sendDailyReport = () => {
    const today = new Date().toLocaleDateString();
    const entries = Object.entries(localSessions);

    const todaySessions = entries.filter(([id, s]) => {
        const isActive = s.status === 'active' || s.status === 'bill_requested';
        const isSettledToday = s.status === 'completed' && s.settledAt && new Date(s.settledAt).toLocaleDateString() === today;
        return (isActive || isSettledToday) && (s.total || 0) > 0;
    });

    const completedToday = entries.filter(([id, s]) => s.status === 'completed' && s.settledAt && new Date(s.settledAt).toLocaleDateString() === today && (s.total || 0) > 0);
    const activeCount = entries.filter(([id, s]) => (s.status === 'active' || s.status === 'bill_requested') && (s.total || 0) > 0).length;

    const totalRevenue = todaySessions.reduce((sum, [, s]) => sum + (s.total || 0), 0);
    const totalOrders = todaySessions.length;
    const avgOrder = totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0;

    // Find top selling item
    const itemCounts = {};
    todaySessions.forEach(([, s]) => {
        (s.items || []).forEach(item => {
            const key = item.name;
            itemCounts[key] = (itemCounts[key] || 0) + item.quantity;
        });
    });
    const topItem = Object.entries(itemCounts).sort((a, b) => b[1] - a[1])[0];
    const dateStr = new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    const message = `📊 *DAILY SALES REPORT*
━━━━━━━━━━━━━━━━
🏬 *${localSettings.storeName || 'DesignE'}*
📅 ${dateStr}

💰 *Revenue:* ₹${totalRevenue.toLocaleString()}
🧾 *Total Orders:* ${totalOrders}
📈 *Avg Order Value:* ₹${avgOrder}
✅ *Settled:* ${completedToday.length}
🔴 *Still Active:* ${activeCount}
${topItem ? `\n🏆 *Top Seller:* ${topItem[0]} (${topItem[1]} sold)` : ''}
━━━━━━━━━━━━━━━━
_Powered by DesignE_`;

    let phone = localSettings.ownerPhone;
    if (!phone) {
        phone = prompt('Enter owner WhatsApp number (10 digits):');
        if (phone && phone.length >= 10) {
            db.ref('settings').update({ ownerPhone: phone });
        }
    }
    
    if (phone) {
        const waUrl = `https://wa.me/91${phone.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`;
        window.open(waUrl, '_blank');
    }
};

// --- Feature 3: Floor Map ---
let localFloorTables = {};
let floorMapVisible = false;

const floorTablesRef = db.ref('tables');

floorTablesRef.on('child_added', (snapshot) => {
    localFloorTables[snapshot.key] = snapshot.val();
    renderFloorMap();
});
floorTablesRef.on('child_changed', (snapshot) => {
    localFloorTables[snapshot.key] = snapshot.val();
    renderFloorMap();
});
floorTablesRef.on('child_removed', (snapshot) => {
    delete localFloorTables[snapshot.key];
    renderFloorMap();
});

function renderFloorMap() {
    const container = document.getElementById('floor-map-container');
    if (!container || !floorMapVisible) return;

    const maxTables = localSettings.tableLimit || 20;

    container.innerHTML = '';
// ... existing loop ...

    for (let i = 1; i <= maxTables; i++) {
        const tableKey = 'table_' + i;
        const tableData = localFloorTables[tableKey];
        let status = 'free';
        let customerName = '';

        if (tableData && tableData.status === 'occupied') {
            // Check if the session has a bill_requested status
            const sid = tableData.sessionId;
            if (sid && localSessions[sid] && localSessions[sid].status === 'bill_requested') {
                status = 'bill_requested';
            } else {
                status = 'occupied';
            }
            customerName = tableData.customerName || '';
        }

        const cell = document.createElement('div');
        cell.className = `floor-table-cell ${status}`;
        cell.innerHTML = `
            <span class="ft-number">${i}</span>
            ${customerName ? `<span class="ft-name">${customerName}</span>` : `<span class="ft-name">${status === 'free' ? 'Free' : ''}</span>`}
        `;
        container.appendChild(cell);
    }
}

window.toggleFloorMap = () => {
    const container = document.getElementById('floor-map-container');
    const header = document.getElementById('floor-map-toggle');
    floorMapVisible = !floorMapVisible;

    if (floorMapVisible) {
        container.style.display = '';
        header.classList.remove('collapsed');
        renderFloorMap();
    } else {
        container.style.display = 'none';
        header.classList.add('collapsed');
    }
};

// Initial calls
loadStoreSettings();
autoPurgeOldData();

// Apply initial floor map visibility (defaults to off)
const fMapContainer = document.getElementById('floor-map-container');
const fMapHeader = document.getElementById('floor-map-toggle');
if (fMapContainer && fMapHeader) {
    if (!floorMapVisible) {
        fMapContainer.style.display = 'none';
        fMapHeader.classList.add('collapsed');
    } else {
        renderFloorMap();
    }
}

function recalculateSessionTotal(session) {
    const subtotal = session.subtotal || (session.items || []).reduce((s, i) => s + (i.price * i.quantity), 0);
    let total = subtotal;
    if (session.modifiers && Array.isArray(session.modifiers)) {
        session.modifiers.forEach(mod => {
            const amount = mod.isPercentage ? (subtotal * (mod.value / 100)) : mod.value;
            if (mod.type === 'discount') total -= amount;
            else total += amount;
        });
    }
    return Math.max(0, Math.round(total));
}

window.openModifierModal = (id) => {
    document.getElementById('mod-session-id').value = id;
    document.getElementById('mod-type').value = 'charge';
    document.getElementById('mod-label').value = '';
    document.getElementById('mod-is-percentage').value = 'true';
    document.getElementById('mod-value').value = '';
    document.getElementById('modifier-modal').classList.add('active');
};

window.closeModifierModal = () => {
    document.getElementById('modifier-modal').classList.remove('active');
};

window.applyQuickMod = (type, label, isPercent, val) => {
    document.getElementById('mod-type').value = type;
    document.getElementById('mod-label').value = label;
    document.getElementById('mod-is-percentage').value = isPercent.toString();
    document.getElementById('mod-value').value = val;
};

window.saveModifier = () => {
    const id = document.getElementById('mod-session-id').value;
    const type = document.getElementById('mod-type').value;
    const label = document.getElementById('mod-label').value.trim() || (type === 'discount' ? 'Discount' : 'Charge');
    const isPercentage = document.getElementById('mod-is-percentage').value === 'true';
    const value = parseFloat(document.getElementById('mod-value').value);

    if (!value || value <= 0) {
        alert("Please enter a valid amount.");
        return;
    }

    const session = localSessions[id];
    if (!session) return;
    
    const modifiers = session.modifiers || [];
    modifiers.push({ type, label, isPercentage, value });
    
    const tempSession = { ...session, modifiers };
    const newTotal = recalculateSessionTotal(tempSession);
    const subtotal = session.subtotal || (session.items || []).reduce((s, i) => s + (i.price * i.quantity), 0);

    db.ref('sessions/' + id).update({
        modifiers,
        subtotal,
        total: newTotal
    }).then(() => {
        closeModifierModal();
    });
};

window.removeModifier = (id, index) => {
    if(!confirm("Remove this modifier?")) return;
    const session = localSessions[id];
    if (!session) return;
    
    let modifiers = session.modifiers || [];
    modifiers.splice(index, 1);
    
    const tempSession = { ...session, modifiers };
    const newTotal = recalculateSessionTotal(tempSession);
    
    db.ref('sessions/' + id).update({
        modifiers,
        total: newTotal
    });
};

// --- Print Bill (Hidden Iframe Method) ---
window.printBill = (sessionId) => {
    const session = localSessions[sessionId];
    if (!session) { alert('Session not found.'); return; }

    const now = new Date();
    const dateStr = now.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const timeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

    const itemRows = (session.items || []).map(item => {
        const amt = item.price * item.quantity;
        return `<tr>
            <td style="text-align:left;">${item.name}</td>
            <td style="text-align:center;">${item.quantity}</td>
            <td style="text-align:right;">Rs.${amt.toLocaleString()}</td>
        </tr>`;
    }).join('');

    const getReceiptHtml = (type) => `
        <div class="receipt">
            <div class="center">
                <h1>${localSettings.storeName || 'DESIGNE'}</h1>
                <div class="sub-hdr">DIGITAL RESTAURANT ORDERING</div>
                <div style="font-weight: bold; margin-top: 5px; font-size: 11px;">-- ${type} --</div>
            </div>
            <hr>
            <div class="info"><span>Table: <strong>${session.tableNo}</strong></span><span>${dateStr}</span></div>
            <div class="info"><span>Customer: <strong>${session.customerName || 'Guest'}</strong></span><span>Bill #${sessionId.substr(-6).toUpperCase()}</span></div>
            <div class="info"><span>Time: ${timeStr}</span></div>
            <hr>
            <table>
                <thead><tr><th>ITEM</th><th style="text-align:center;">QTY</th><th style="text-align:right;">AMT</th></tr></thead>
                <tbody>
                    ${itemRows}
                    ${session.modifiers && session.modifiers.length > 0 ? `<tr><td colspan="2" style="text-align:right; font-weight: bold; border-top: 1px dashed black; padding-top: 5px;">Subtotal</td><td style="text-align:right; border-top: 1px dashed black; padding-top: 5px;">Rs.${(session.subtotal || session.total || 0).toLocaleString()}</td></tr>` : ''}
                    ${(session.modifiers || []).map(mod => {
                        const amtStr = mod.isPercentage ? mod.value + '%' : 'Rs.' + mod.value;
                        const label = mod.type === 'discount' ? 'Discount (' + mod.label + ')' : 'Charge (' + mod.label + ')';
                        const calculatedAmt = mod.isPercentage ? ((session.subtotal || 0) * (mod.value / 100)) : mod.value;
                        const sign = mod.type === 'discount' ? '-' : '+';
                        return `<tr><td colspan="2" style="text-align:right; font-size: 11px;">${label} [${amtStr}]</td><td style="text-align:right; font-size: 11px;">${sign}Rs.${Math.round(calculatedAmt).toLocaleString()}</td></tr>`;
                    }).join('')}
                </tbody>
            </table>
            <div class="total-row"><span>NET TOTAL</span><span>Rs.${(session.total || 0).toLocaleString()}</span></div>
            <hr>
            <div class="footer">
                <p>Thank you for visiting, ${session.customerName || 'Guest'}!</p>
                <p>We hope to see you again soon 🍕✨</p>
                <p style="margin-top: 5px; font-weight: bold;">POWERED BY DESIGNE</p>
            </div>
        </div>
    `;

    const billHtml = `
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            @page { margin: 5mm; size: auto; }
            body { margin: 0; padding: 0; font-family: 'Courier New', Courier, monospace; width: 100%; font-size: 13px; color: #000; }
            .receipt { width: 100%; max-width: 100%; box-sizing: border-box; }
            .center { text-align: center; margin-bottom: 5px; }
            .center h1 { font-size: 22px; margin: 0; letter-spacing: 2px; }
            .sub-hdr { font-size: 10px; color: #555; margin-bottom: 5px; }
            hr { border: none; border-top: 1px dashed black; margin: 8px 0; }
            .info { display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 3px; gap: 10px; }
            table { width: 100%; border-collapse: collapse; margin: 8px 0; }
            th { text-align: left; font-size: 10px; border-bottom: 1px solid black; padding-bottom: 3px; }
            td { padding: 4px 0; font-size: 12px; }
            .total-row { display: flex; justify-content: space-between; font-size: 16px; font-weight: bold; margin-top: 5px; padding-top: 5px; border-top: 1px double black; }
            .footer { text-align: center; margin-top: 15px; font-size: 9px; line-height: 1.4; color: #555; }
            .tear-line { 
                border-top: 2px dashed #000; 
                margin: 30px 0; 
                position: relative; 
                text-align: center; 
            }
            .tear-line span { 
                position: absolute; 
                top: -10px; 
                left: 50%; 
                transform: translateX(-50%); 
                background: white; 
                padding: 0 10px; 
                font-size: 10px; 
                font-weight: bold; 
                text-transform: uppercase;
                letter-spacing: 2px;
            }
        </style>
    </head>
    <body onload="window.print()">
        ${getReceiptHtml('CUSTOMER COPY')}
    </body>
    </html>`;

    // Remove old frame if exists
    const oldFrame = document.getElementById('bill-print-frame');
    if (oldFrame) oldFrame.remove();

    // Create hidden iframe
    const iframe = document.createElement('iframe');
    iframe.id = 'bill-print-frame';
    iframe.style.position = 'absolute';
    iframe.style.width = '0px';
    iframe.style.height = '0px';
    iframe.style.border = 'none';
    iframe.srcdoc = billHtml;

    document.body.appendChild(iframe);
};
function autoPurgeOldData() {
    // Financial Year Logic (India: April 1st)
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth(); // 0-indexed (April is 3)
    
    let fyStartYear = currentYear;
    if (currentMonth < 3) { // Before April
        fyStartYear = currentYear - 1;
    }
    
    const fyStartDate = new Date(fyStartYear, 3, 1, 0, 0, 0); // April 1st of current FY
    const fyThreshold = fyStartDate.getTime();
    
    // Auto-delete everything older than the current Financial Year
    // ONLY targets completed sessions. Active sessions have no settledAt and are skipped.
    db.ref('sessions')
        .orderByChild('settledAt')
        .endAt(fyThreshold - 1)
        .once('value', snapshot => {
            const allMatch = snapshot.val();
            if (allMatch) {
                let purgeCount = 0;
                
                Object.keys(allMatch).forEach(key => {
                    const session = allMatch[key];
                    // CRITICAL: Only remove if it actually HAS a settledAt value.
                    // Firebase orderBy captures null values at the start of the range.
                    if (session.settledAt && session.settledAt < fyThreshold) {
                        db.ref('sessions/' + key).remove();
                        purgeCount++;
                    }
                });
                
                if (purgeCount > 0) {
                    console.log(`[AutoPurge] Deleted ${purgeCount} records from previous financial years.`);
                    
                    // Show a subtle notification if cleanup performed
                    const toast = document.createElement('div');
                    toast.style = "position: fixed; bottom: 2rem; right: 2rem; background: var(--bg-dark); border: 1px solid var(--glass-border); padding: 1rem; border-radius: 12px; font-size: 0.8rem; z-index: 10000; box-shadow: var(--shadow-soft); color: white;";
                    toast.innerHTML = `<i class="fas fa-broom" style="color: var(--primary-glow);"></i> Performance cleanup: ${purgeCount} old records archived.`;
                    document.body.appendChild(toast);
                    setTimeout(() => toast.remove(), 5000);
                }
            }
        });
}

// --- Connection Optimization ---
// Automatically disconnects from Firebase when the tab is hidden to save connections.
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
        console.log('[Firebase] Tab hidden. Conserving connections...');
        firebase.database().goOffline();
        if (typeof saasDb !== 'undefined') saasDb.goOffline();
    } else {
        console.log('[Firebase] Tab active. Restoring connections...');
        firebase.database().goOnline();
        if (typeof saasDb !== 'undefined') saasDb.goOnline();
    }
});
