let localMenu = {};
let localOffers = {};
let localCategories = {};
let currentTab = 'menu';
let activeCategoryFilter = 'all';
let menuSearchQuery = '';

// Auth Guard
firebase.auth().onAuthStateChanged((user) => {
    if (!user) {
        window.location.href = 'login.html';
    } else {
        init();
    }
});

function init() {
    loadCategories();
    watchMenu();
    watchOffers();
}

// Data Fetching
function loadCategories() {
    firebase.database().ref('categories').orderByChild('order').on('value', snapshot => {
        localCategories = snapshot.val() || {};
        renderCategories();
        updateCategorySelects();
        if (currentTab === 'menu') renderCategoryFilters();
    });
}

function watchMenu() {
    firebase.database().ref('menu').on('value', snapshot => {
        localMenu = snapshot.val() || {};
        if (currentTab === 'menu') renderMenuItems();
    });
}

function watchOffers() {
    firebase.database().ref('offers').on('value', snapshot => {
        localOffers = snapshot.val() || {};
        if (currentTab === 'offers') renderOffers();
    });
}

// Responsive Navigation
window.toggleSidebar = () => {
    document.getElementById('sidebar').classList.toggle('active');
};

window.closeSidebar = () => {
    document.getElementById('sidebar').classList.remove('active');
};

window.switchTab = (tab) => {
    currentTab = tab;
    // Update Nav UI
    document.querySelectorAll('.nav-link').forEach(el => el.classList.remove('active'));
    document.getElementById(`nav-${tab}`).classList.add('active');
    
    // Update Section UI
    document.querySelectorAll('.admin-section').forEach(el => el.style.display = 'none');
    document.getElementById(`section-${tab}`).style.display = 'block';

    if (tab === 'menu') {
        renderCategoryFilters();
        renderMenuItems();
    }
    if (tab === 'offers') renderOffers();
    if (tab === 'security') loadSecuritySettings();
};

function loadSecuritySettings() {
    firebase.database().ref('settings').once('value', snapshot => {
        if (snapshot.exists()) {
            const data = snapshot.val();
            const idInput = document.getElementById('admin-owner-id');
            const passInput = document.getElementById('admin-owner-pass');
            if (idInput) idInput.value = data.ownerId || 'admin';
            if (passInput) passInput.value = data.ownerPass || '1234';
        }
    });
}

// Filtering Logic
window.handleSearch = (query) => {
    menuSearchQuery = query.toLowerCase().trim();
    renderMenuItems();
};

window.setCategoryFilter = (catId) => {
    activeCategoryFilter = catId;
    renderCategoryFilters();
    renderMenuItems();
};

function renderCategoryFilters() {
    const container = document.getElementById('category-filter-tabs');
    if (!container) return;
    
    let html = `<div class="filter-tab ${activeCategoryFilter === 'all' ? 'active' : ''}" onclick="setCategoryFilter('all')">All Items</div>`;
    
    Object.entries(localCategories).sort((a,b) => a[1].order - b[1].order).forEach(([id, cat]) => {
        html += `<div class="filter-tab ${activeCategoryFilter === id ? 'active' : ''}" onclick="setCategoryFilter('${id}')">${cat.name}</div>`;
    });
    
    container.innerHTML = html;
}

// Renderers
function renderMenuItems() {
    const grid = document.getElementById('admin-menu-grid');
    if (!grid) return;
    grid.innerHTML = '';
    
    // Convert to array and handle array/object formats from Firebase
    let items = Object.entries(localMenu || {})
        .filter(([id, item]) => item && typeof item === 'object')
        .sort((a, b) => b[0].toString().localeCompare(a[0].toString())); // Newest items first

    // Apply Category Filter
    if (activeCategoryFilter !== 'all') {
        items = items.filter(([id, item]) => item.category === activeCategoryFilter);
    }

    // Apply Search Filter
    if (menuSearchQuery) {
        items = items.filter(([id, item]) => 
            item.name.toLowerCase().includes(menuSearchQuery) || 
            (item.description && item.description.toLowerCase().includes(menuSearchQuery))
        );
    }

    if (items.length === 0) {
        grid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 4rem; color: var(--text-muted);">
            <i class="fas fa-search" style="font-size: 3rem; margin-bottom: 1.5rem; opacity: 0.2;"></i>
            <p>${menuSearchQuery || activeCategoryFilter !== 'all' ? 'No items match your filters.' : 'No menu items found. Start by adding your first dish!'}</p>
        </div>`;
        return;
    }

    items.forEach(([id, item]) => {
        try {
            const catName = localCategories[item.category]?.name || item.category || 'Uncategorized';
            const card = document.createElement('div');
            card.className = 'item-card';
            card.innerHTML = `
                <div class="item-img-wrapper">
                    <img src="${item.image || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400'}" class="item-img" onerror="this.src='https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400'">
                    <div class="item-badge ${item.available ? 'badge-available' : 'badge-soldout'}">
                        ${item.available ? 'Available' : 'Sold Out'}
                    </div>
                </div>
                <div class="item-info">
                    <div style="display: flex; align-items: center; gap: 0.5rem;">
                        <h3 style="margin:0; font-size: 1.25rem;">${item.name || 'Unnamed Item'}</h3>
                        ${item.dietary ? `<span class="${item.dietary}-badge" style="margin: 0; padding: 0.1rem 0.3rem;"></span>` : ''}
                    </div>
                    <p style="font-size: 0.8rem; color: var(--text-muted); margin: 0.4rem 0;">${catName}</p>
                    <div class="item-details">
                        <span class="item-price">₹${item.price || 0}</span>
                    </div>
                </div>
                <div class="item-actions">
                    <button onclick="editMenuItem('${id}')" class="btn-action"><i class="fas fa-edit"></i> Edit</button>
                    <button onclick="deleteMenuItem('${id}')" class="btn-action delete"><i class="fas fa-trash"></i></button>
                </div>
            `;
            grid.appendChild(card);
        } catch (err) {
            console.error("Error rendering item:", id, err);
        }
    });
}

function renderOffers() {
    const grid = document.getElementById('admin-offers-grid');
    grid.innerHTML = '';
    
    Object.entries(localOffers).forEach(([id, offer]) => {
        const card = document.createElement('div');
        card.className = 'item-card';
        card.innerHTML = `
            <div class="item-img-wrapper">
                <img src="${offer.image || 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=400'}" class="item-img">
                <div class="item-badge" style="background: var(--accent-main); color: white;">${offer.tag || 'PROMO'}</div>
            </div>
            <div class="item-info">
                <h3 style="margin:0; font-size: 1.1rem;">${offer.title}</h3>
                <p style="font-size:0.8rem; color:var(--text-muted); line-height: 1.4; margin-top: 0.5rem;">${offer.description}</p>
            </div>
            <div class="item-actions">
                <button onclick="editOffer('${id}')" class="btn-action"><i class="fas fa-edit"></i> Edit</button>
                <button onclick="deleteOffer('${id}')" class="btn-action delete"><i class="fas fa-trash"></i></button>
            </div>
        `;
        grid.appendChild(card);
    });
}

function renderCategories() {
    const list = document.getElementById('admin-categories-list');
    list.innerHTML = '';
    
    Object.entries(localCategories).sort((a,b) => a[1].order - b[1].order).forEach(([id, cat]) => {
        const div = document.createElement('div');
        div.className = 'item-card';
        div.style.flexDirection = 'row';
        div.style.alignItems = 'center';
        div.style.justifyContent = 'space-between';
        div.style.padding = '1.5rem';
        div.innerHTML = `
            <div style="display: flex; align-items: center; gap: 1.5rem;">
                <span style="color: var(--primary); font-weight: 800; font-size: 1.2rem; opacity: 0.5;">#${cat.order}</span>
                <span style="font-weight: 700; font-size: 1.1rem;">${cat.name}</span>
                <code style="font-size: 0.75rem; color: var(--text-muted); background: rgba(255,255,255,0.05); padding: 0.2rem 0.5rem; border-radius: 6px;">ID: ${id}</code>
            </div>
            <div style="display: flex; gap: 1rem;">
                <button onclick="deleteCategory('${id}')" class="btn-action delete" style="padding: 0.6rem;"><i class="fas fa-times"></i></button>
            </div>
        `;
        list.appendChild(div);
    });
}

function updateCategorySelects() {
    const select = document.getElementById('item-category');
    if (!select) return;
    
    select.innerHTML = '<option value="">Select Category</option>';
    Object.entries(localCategories).forEach(([id, cat]) => {
        const opt = document.createElement('option');
        opt.value = id;
        opt.innerText = cat.name;
        select.appendChild(opt);
    });
}

// Menu CRUD
window.openMenuModal = () => {
    document.getElementById('modal-title').innerText = 'Add Menu Item';
    document.getElementById('menu-form').reset();
    document.getElementById('edit-item-id').value = '';
    document.getElementById('item-dietary').value = '';
    document.getElementById('variants-list').innerHTML = '';
    document.getElementById('price-field-container').style.display = 'block';
    document.getElementById('menu-modal').classList.add('active');
};

window.editMenuItem = (id) => {
    const item = localMenu[id];
    document.getElementById('modal-title').innerText = 'Edit Menu Item';
    document.getElementById('edit-item-id').value = id;
    document.getElementById('item-name').value = item.name;
    document.getElementById('item-category').value = item.category;
    document.getElementById('item-price').value = item.price || 0;
    document.getElementById('item-dietary').value = item.dietary || '';
    document.getElementById('item-image').value = item.image || '';
    document.getElementById('item-description').value = item.description || '';
    document.getElementById('item-available').checked = item.available !== false;
    
    // Fill Variants
    const variantsList = document.getElementById('variants-list');
    variantsList.innerHTML = '';
    if (item.variants && Array.isArray(item.variants)) {
        item.variants.forEach(v => addVariantField(v.name, v.price));
        document.getElementById('price-field-container').style.display = 'none';
    } else {
        document.getElementById('price-field-container').style.display = 'block';
    }
    
    document.getElementById('menu-modal').classList.add('active');
};

window.addVariantField = (name = '', price = '') => {
    const container = document.getElementById('variants-list');
    const div = document.createElement('div');
    div.className = 'variant-row';
    const vId = Date.now();
    div.innerHTML = `
        <div class="input-field">
            <label for="vname_${vId}" style="font-size: 0.7rem;">Variant Name</label>
            <input type="text" id="vname_${vId}" class="variant-name" value="${name}" placeholder="e.g. Large" required>
        </div>
        <div class="input-field">
            <label for="vprice_${vId}" style="font-size: 0.7rem;">Price (₹)</label>
            <input type="number" id="vprice_${vId}" class="variant-price" value="${price}" placeholder="120" required>
        </div>
        <button type="button" onclick="this.parentElement.remove(); checkPriceField();" class="btn-action delete" style="padding: 0.6rem; height: 44px;"><i class="fas fa-times"></i></button>
    `;
    container.appendChild(div);
    checkPriceField();
};

window.checkPriceField = () => {
    const hasVariants = document.querySelectorAll('.variant-row').length > 0;
    document.getElementById('price-field-container').style.display = hasVariants ? 'none' : 'block';
};

window.saveMenuItem = (e) => {
    e.preventDefault();
    const saveBtn = document.getElementById('save-item-btn');
    const originalBtnText = saveBtn.innerText;
    saveBtn.innerText = 'SAVING...';
    saveBtn.disabled = true;

    const id = document.getElementById('edit-item-id').value || 'item_' + Date.now();
    
    // Collect Variants
    const variants = [];
    document.querySelectorAll('.variant-row').forEach(row => {
        const vName = row.querySelector('.variant-name').value.trim();
        const vPrice = parseFloat(row.querySelector('.variant-price').value);
        if (vName && !isNaN(vPrice)) {
            variants.push({ name: vName, price: vPrice });
        }
    });

    const data = {
        name: document.getElementById('item-name').value.trim(),
        category: document.getElementById('item-category').value,
        dietary: document.getElementById('item-dietary').value,
        price: variants.length > 0 ? variants[0].price : parseFloat(document.getElementById('item-price').value || 0),
        image: document.getElementById('item-image').value.trim(),
        description: document.getElementById('item-description').value.trim(),
        available: document.getElementById('item-available').checked,
        id: id
    };

    if (variants.length > 0) data.variants = variants;

    firebase.database().ref('menu/' + id).set(data).then(() => {
        closeModals();
        alert("Menu item saved!");
    }).catch(err => {
        console.error("Firebase Save Error:", err);
        alert("Error saving item: " + err.message);
    }).finally(() => {
        saveBtn.innerText = originalBtnText;
        saveBtn.disabled = false;
        document.getElementById('edit-item-id').value = ''; // Ensure ID is cleared
    });
};

window.deleteMenuItem = (id) => {
    if (confirm("Are you sure you want to delete this item?")) {
        firebase.database().ref('menu/' + id).remove();
    }
};

window.closeModals = () => {
    document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
};

// Offer CRUD exports stay similar but with better UI in render
window.openOfferModal = () => {
    document.getElementById('offer-modal-title').innerText = 'Add Offer';
    document.getElementById('offer-form').reset();
    document.getElementById('edit-offer-id').value = '';
    document.getElementById('offer-modal').classList.add('active');
};

window.editOffer = (id) => {
    const offer = localOffers[id];
    document.getElementById('offer-modal-title').innerText = 'Edit Offer';
    document.getElementById('edit-offer-id').value = id;
    document.getElementById('offer-title').value = offer.title;
    document.getElementById('offer-tag').value = offer.tag || '';
    document.getElementById('offer-price').value = offer.price || 0;
    document.getElementById('offer-image').value = offer.image || '';
    document.getElementById('offer-description').value = offer.description || '';
    document.getElementById('offer-active').checked = offer.active !== false;
    document.getElementById('offer-modal').classList.add('active');
};

window.saveOffer = (e) => {
    e.preventDefault();
    const id = document.getElementById('edit-offer-id').value || 'offer_' + Date.now();
    const data = {
        title: document.getElementById('offer-title').value.trim(),
        tag: document.getElementById('offer-tag').value.trim(),
        price: parseFloat(document.getElementById('offer-price').value),
        image: document.getElementById('offer-image').value.trim(),
        description: document.getElementById('offer-description').value.trim(),
        active: document.getElementById('offer-active').checked,
        id: id
    };

    firebase.database().ref('offers/' + id).set(data).then(() => {
        closeModals();
        alert("Offer saved!");
    });
};

window.deleteOffer = (id) => {
    if (confirm("Are you sure you want to delete this offer?")) {
        firebase.database().ref('offers/' + id).remove();
    }
};

// Category CRUD
window.addCategory = () => {
    const name = prompt("Enter Category Name (e.g. Desserts):");
    if (!name) return;
    const id = name.toLowerCase().replace(/\s+/g, '_');
    const order = Object.keys(localCategories).length + 1;
    
    firebase.database().ref('categories/' + id).set({ name, order });
};

window.deleteCategory = (id) => {
    const itemsCount = Object.values(localMenu).filter(i => i.category === id).length;
    if (itemsCount > 0) {
        alert(`Cannot delete category "${id}" as it contains ${itemsCount} items. Move items to another category first.`);
        return;
    }
    if (confirm(`Delete category "${id}"?`)) {
        firebase.database().ref('categories/' + id).remove();
    }
};

// Security
window.changePassword = () => {
    const newPass = document.getElementById('new-password').value;
    const confirmPass = document.getElementById('confirm-password').value;
    
    if (newPass !== confirmPass) {
        alert("Passwords do not match!");
        return;
    }
    if (newPass.length < 6) {
        alert("Password must be at least 6 characters.");
        return;
    }
    
    const user = firebase.auth().currentUser;
    user.updatePassword(newPass).then(() => {
        alert("Password updated successfully!");
        document.getElementById('new-password').value = '';
        document.getElementById('confirm-password').value = '';
    }).catch(err => {
        alert("Error: " + err.message);
        if(err.code === 'auth/requires-recent-login') {
            alert("For security, please logout and login again to change your password.");
        }
    });
};

window.updateOwnerCredentials = () => {
    const ownerId = document.getElementById('admin-owner-id').value.trim();
    const ownerPass = document.getElementById('admin-owner-pass').value.trim();

    if (!ownerId || !ownerPass) {
        alert("Both ID and Password are required.");
        return;
    }

    const btn = document.getElementById('update-owner-cred-btn');
    const originalText = btn.innerText;
    btn.disabled = true;
    btn.innerText = 'UPDATING...';

    firebase.database().ref('settings').update({
        ownerId,
        ownerPass
    }).then(() => {
        alert("Owner credentials updated successfully!");
    }).catch(err => {
        alert("Error updating credentials: " + err.message);
    }).finally(() => {
        btn.disabled = false;
        btn.innerText = originalText;
    });
};

window.logout = () => {
    firebase.auth().signOut().then(() => window.location.href = 'login.html');
};

// --- Connection Optimization ---
// Automatically disconnects from Firebase when the tab is hidden to save connections.
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
        console.log('[Firebase] Admin Tab hidden. Conserving connections...');
        firebase.database().goOffline();
        if (typeof saasDb !== 'undefined') saasDb.goOffline();
    } else {
        console.log('[Firebase] Admin Tab active. Restoring connections...');
        firebase.database().goOnline();
        if (typeof saasDb !== 'undefined') saasDb.goOnline();
    }
});
