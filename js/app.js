
(function () {
  'use strict';

  const PAGE_SIZE = 7;
  const STORAGE_KEY = 'laundry-customer-ui-v2';

  // Small inline SVG icons eliminate external icon dependencies.
  const ICON_PATHS = {
    'panel-left': '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/>',
    'layout-dashboard': '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
    'users': '<circle cx="9" cy="7" r="4"/><path d="M2 21v-2a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4v2M16 3.1a4 4 0 0 1 0 7.8M22 21v-2a4 4 0 0 0-3-3.9"/>',
    'settings': '<circle cx="12" cy="12" r="3.5"/><path d="M19 13.5a7 7 0 0 0 0-3l2-1.3-2-3.4-2.2 1a7 7 0 0 0-2.6-1.5L13.9 3h-3.8l-.3 2.3A7 7 0 0 0 7.2 6.8L5 5.8 3 9.2l2 1.3a7 7 0 0 0 0 3l-2 1.3 2 3.4 2.2-1a7 7 0 0 0 2.6 1.5l.3 2.3h3.8l.3-2.3a7 7 0 0 0 2.6-1.5l2.2 1 2-3.4z"/>',
    'search': '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
    'chevron-down': '<path d="m6 9 6 6 6-6"/>',
    'chevron-left': '<path d="m15 18-6-6 6-6"/>',
    'chevron-right': '<path d="m9 18 6-6-6-6"/>',
    'plus': '<path d="M12 5v14M5 12h14"/>',
    'x': '<path d="M18 6 6 18M6 6l12 12"/>',
    'trash': '<path d="M3 6h18m-2 0-.7 14H5.7L5 6m3-3h8l1 3M10 10v7m4-7v7"/>',
    'pencil': '<path d="m16 5 3 3M4 20l4.5-.9L20 7.6 16.4 4 5 15.5z"/>'
  };

  const state = {
    customers: [],
    tab: 'All',
    status: 'All',
    search: '',
    page: 1,
    editingId: null,
    selectedId: null,
    changes: loadChanges(),
    toastTimeout: null,
    previousFocus: null
  };

  function byId(id) {
    return document.getElementById(id);
  }

  function icon(name) {
    const path = ICON_PATHS[name] || '';

    return `
      <svg
        viewBox="0 0 24 24"
        width="16"
        height="16"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >${path}</svg>
    `;
  }

  function installIcons() {
    document.querySelectorAll('[data-icon]').forEach((element) => {
      element.innerHTML = icon(element.dataset.icon);
    });
  }

  function escapeHTML(value) {
    const entities = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    };

    return String(value ?? '').replace(/[&<>"']/g, (char) => entities[char]);
  }

  function formatNumber(number) {
    return Number(number).toLocaleString('en-US');
  }

  function formatMoney(amount) {
    return '$' + Number(amount).toLocaleString('en-US', {
      maximumFractionDigits: 0
    });
  }

  function displayName(customer) {
    return `${customer.firstName} ${customer.lastName}`.trim();
  }

  // ---------------------------------------------------------------------------
  // Local demo data: replace this section with the backend CustomerService API.
  // ---------------------------------------------------------------------------

  function loadChanges() {
    const emptyChanges = { added: [], edited: {}, deleted: [] };

    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');

      return {
        added: Array.isArray(saved.added) ? saved.added : [],
        edited: saved.edited && typeof saved.edited === 'object' ? saved.edited : {},
        deleted: Array.isArray(saved.deleted) ? saved.deleted : []
      };
    } catch (error) {
      console.warn('Saved demo data could not be loaded:', error);
      return emptyChanges;
    }
  }

  function saveChanges() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.changes));
    } catch (error) {
      console.warn('Demo data could not be saved:', error);
      showToast('Browser storage is unavailable. Changes may not persist.');
    }
  }

  function refreshCustomers() {
    const sampleCustomers = window.LaundryMockData.createMockCustomers();
    const deletedIds = new Set(state.changes.deleted);

    const updatedSamples = sampleCustomers.map((customer) => {
      return state.changes.edited[customer.id] || customer;
    });

    state.customers = [
      ...state.changes.added,
      ...updatedSamples
    ].filter((customer) => !deletedIds.has(customer.id));
  }

  function getCustomer(id) {
    return state.customers.find((customer) => customer.id === id);
  }

  // ---------------------------------------------------------------------------
  // List filtering and table rendering
  // ---------------------------------------------------------------------------

  function filteredCustomers() {
    const query = state.search.trim().toLowerCase();

    return state.customers.filter((customer) => {
      const matchesTab = state.tab === 'All' || customer.status === state.tab;
      const matchesStatus = state.status === 'All' || customer.status === state.status;

      const searchableText = [
        customer.firstName,
        customer.lastName,
        displayName(customer),
        customer.phone
      ].join(' ').toLowerCase();

      return matchesTab && matchesStatus && searchableText.includes(query);
    });
  }

  function renderCustomerRow(customer) {
    const subtitle = customer.isSample ? 'Sample customer record' : 'Customer record';

    return `
      <tr
        class="customer-row"
        data-customer-id="${escapeHTML(customer.id)}"
        tabindex="0"
        aria-label="View ${escapeHTML(displayName(customer))}"
      >
        <td>
          <div class="customer-cell">
            <span class="customer-identity">
              <strong>${escapeHTML(displayName(customer))}</strong>
              <small>${escapeHTML(subtitle)}</small>
            </span>
          </div>
        </td>
        <td>${escapeHTML(customer.phone)}</td>
        <td class="numeric-cell">${formatNumber(customer.orders)}</td>
        <td class="numeric-cell">${formatMoney(customer.totalSpent)}</td>
        <td>${escapeHTML(customer.lastContact)}</td>
      </tr>
    `;
  }

  function paginationItems(currentPage, totalPages) {
    if (totalPages <= 5) {
      return Array.from({ length: totalPages }, (_, index) => index + 1);
    }

    if (currentPage <= 3) {
      return [1, 2, 3, '…', totalPages];
    }

    if (currentPage >= totalPages - 2) {
      return [1, '…', totalPages - 2, totalPages - 1, totalPages];
    }

    return [1, '…', currentPage - 1, currentPage, currentPage + 1, '…', totalPages];
  }

  function renderPagination(totalPages) {
    const pagination = byId('pagination');
    const currentPage = state.page;
    const items = paginationItems(currentPage, totalPages);

    const pageButtons = items.map((item) => {
      if (item === '…') {
        return '<span class="pagination-ellipsis" aria-hidden="true">…</span>';
      }

      const current = item === currentPage;

      return `
        <button
          type="button"
          class="page-button ${current ? 'active' : ''}"
          data-page-number="${item}"
          ${current ? 'aria-current="page"' : ''}
          aria-label="Page ${item}"
        >${item}</button>
      `;
    }).join('');

    pagination.innerHTML = `
      <button
        type="button"
        class="page-button"
        data-page-number="${currentPage - 1}"
        aria-label="Previous page"
        ${currentPage === 1 ? 'disabled' : ''}
      >${icon('chevron-left')}</button>
      ${pageButtons}
      <button
        type="button"
        class="page-button"
        data-page-number="${currentPage + 1}"
        aria-label="Next page"
        ${currentPage === totalPages ? 'disabled' : ''}
      >${icon('chevron-right')}</button>
    `;
  }

  function renderTable() {
    const customers = filteredCustomers();
    const totalPages = Math.max(1, Math.ceil(customers.length / PAGE_SIZE));

    state.page = Math.min(state.page, totalPages);

    const startIndex = (state.page - 1) * PAGE_SIZE;
    const visibleCustomers = customers.slice(startIndex, startIndex + PAGE_SIZE);

    byId('customerRows').innerHTML = visibleCustomers.map(renderCustomerRow).join('');
    byId('emptyState').classList.toggle('hidden', customers.length > 0);

    const first = customers.length === 0 ? 0 : startIndex + 1;
    const last = Math.min(startIndex + PAGE_SIZE, customers.length);

    byId('resultsLabel').textContent =
      `Showing ${formatNumber(first)} to ${formatNumber(last)} of ${formatNumber(customers.length)} customers`;

    renderPagination(totalPages);
  }

  function renderAll() {
    refreshCustomers();
    renderTable();
  }

  function setActiveTab(tab) {
    state.tab = tab;
    state.page = 1;

    document.querySelectorAll('[data-tab]').forEach((button) => {
      const active = button.dataset.tab === tab;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });

    renderTable();
  }

  function clearFilters() {
    state.search = '';
    state.status = 'All';
    state.page = 1;

    byId('searchInput').value = '';
    byId('statusFilter').value = 'All';
    setActiveTab('All');
  }

  // ---------------------------------------------------------------------------
  // Dialog and customer CRUD operations
  // ---------------------------------------------------------------------------

  function toggleOverlay(id, visible) {
    const overlay = byId(id);
    overlay.classList.toggle('hidden', !visible);

    const anyOpen = !byId('formOverlay').classList.contains('hidden') ||
                    !byId('detailOverlay').classList.contains('hidden');

    document.body.classList.toggle('dialog-open', anyOpen);
  }

  function openForm(customerId = null) {
    const customer = customerId ? getCustomer(customerId) : null;

    state.previousFocus = document.activeElement;
    state.editingId = customerId;
    byId('customerForm').reset();
    byId('formError').classList.add('hidden');

    byId('formTitle').textContent = customer ? 'Edit customer' : 'Add customer';
    byId('saveCustomerButton').textContent = customer ? 'Save changes' : 'Save customer';

    byId('firstName').value = customer?.firstName || '';
    byId('lastName').value = customer?.lastName || '';
    byId('phoneNumber').value = customer?.phone || '';
    byId('customerStatus').value = customer?.status || 'New';

    toggleOverlay('detailOverlay', false);
    toggleOverlay('formOverlay', true);
    byId('firstName').focus();
  }

  function closeForm() {
    toggleOverlay('formOverlay', false);
    state.editingId = null;
    state.previousFocus?.focus?.();
  }

  function showFormError(message) {
    const error = byId('formError');
    error.textContent = message;
    error.classList.remove('hidden');
  }

  function saveCustomer(event) {
    event.preventDefault();

    const firstName = byId('firstName').value.trim();
    const lastName = byId('lastName').value.trim();
    const phone = byId('phoneNumber').value.trim();
    const status = byId('customerStatus').value;

    if (!firstName || !lastName || !phone) {
      showFormError('First name, last name, and contact number are required.');
      return;
    }

    if (state.editingId) {
      const existing = getCustomer(state.editingId);
      if (!existing) return;

      const updated = { ...existing, firstName, lastName, phone, status };
      const addedIndex = state.changes.added.findIndex((item) => item.id === existing.id);

      if (addedIndex !== -1) {
        state.changes.added[addedIndex] = updated;
      } else {
        state.changes.edited[existing.id] = updated;
      }

      saveChanges();
      closeForm();
      renderAll();
      showToast('Customer updated successfully.');
      return;
    }

    const customer = {
      id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      firstName,
      lastName,
      phone,
      status,
      orders: 0,
      totalSpent: 0,
      lastContact: 'Just now',
      isSample: false
    };

    state.changes.added.unshift(customer);
    saveChanges();
    closeForm();
    clearFilters();
    renderAll();
    showToast('Customer added successfully.');
  }

  function openCustomerDetails(customerId) {
    const customer = getCustomer(customerId);
    if (!customer) return;

    state.selectedId = customer.id;
    state.previousFocus = document.activeElement;

    byId('detailName').textContent = displayName(customer);
    byId('detailSubheading').textContent = customer.isSample
      ? 'Sample customer record'
      : 'Customer record';

    const fields = [
      ['Phone number', customer.phone],
      ['Category', customer.status],
      ['Orders', formatNumber(customer.orders)],
      ['Total spent', formatMoney(customer.totalSpent)],
      ['Last contact', customer.lastContact]
    ];

    byId('detailFields').innerHTML = fields.map(([label, value]) => {
      return `
        <div class="detail-field">
          <dt>${escapeHTML(label)}</dt>
          <dd>${escapeHTML(value)}</dd>
        </div>
      `;
    }).join('');

    toggleOverlay('detailOverlay', true);
    byId('closeDetailButton').focus();
  }

  function closeDetails() {
    toggleOverlay('detailOverlay', false);
    state.selectedId = null;
    state.previousFocus?.focus?.();
  }

  function deleteSelectedCustomer() {
    const customer = getCustomer(state.selectedId);
    if (!customer) return;

    if (!window.confirm(`Delete ${displayName(customer)} from the demo customer list?`)) {
      return;
    }

    const addedIndex = state.changes.added.findIndex((item) => item.id === customer.id);

    if (addedIndex !== -1) {
      state.changes.added.splice(addedIndex, 1);
    } else {
      state.changes.deleted.push(customer.id);
      delete state.changes.edited[customer.id];
    }

    saveChanges();
    closeDetails();
    renderAll();
    showToast('Customer deleted from demo data.');
  }

  function showToast(message) {
    const toast = byId('toast');
    toast.textContent = message;
    toast.classList.add('visible');

    clearTimeout(state.toastTimeout);
    state.toastTimeout = setTimeout(() => {
      toast.classList.remove('visible');
    }, 3000);
  }

  // ---------------------------------------------------------------------------
  // Navigation and event wiring
  // ---------------------------------------------------------------------------

  function navigateTo(hash) {
    const page = ['#overview', '#customers', '#settings'].includes(hash)
      ? hash.slice(1)
      : 'customers';

    byId('customerPage').classList.toggle('hidden', page !== 'customers');
    byId('otherPage').classList.toggle('hidden', page === 'customers');

    if (page !== 'customers') {
      byId('otherPageTitle').textContent = page === 'overview' ? 'Overview' : 'Settings';
    }

    document.querySelectorAll('[data-page]').forEach((link) => {
      const active = link.dataset.page === page;
      link.classList.toggle('active', active);

      if (active) {
        link.setAttribute('aria-current', 'page');
      } else {
        link.removeAttribute('aria-current');
      }
    });
  }

  function setUpEvents() {
    byId('searchInput').addEventListener('input', (event) => {
      state.search = event.target.value;
      state.page = 1;
      renderTable();
    });

    document.querySelectorAll('[data-tab]').forEach((button) => {
      button.addEventListener('click', () => setActiveTab(button.dataset.tab));
    });

    byId('statusFilter').addEventListener('change', (event) => {
      state.status = event.target.value;
      state.page = 1;
      renderTable();
    });

    byId('clearFiltersButton').addEventListener('click', clearFilters);

    byId('pagination').addEventListener('click', (event) => {
      const button = event.target.closest('[data-page-number]');
      if (!button || button.disabled) return;

      state.page = Number(button.dataset.pageNumber);
      renderTable();
    });

    byId('customerRows').addEventListener('click', (event) => {
      const row = event.target.closest('[data-customer-id]');
      if (row) openCustomerDetails(row.dataset.customerId);
    });

    byId('customerRows').addEventListener('keydown', (event) => {
      const row = event.target.closest('[data-customer-id]');
      if (!row || !['Enter', ' '].includes(event.key)) return;

      event.preventDefault();
      openCustomerDetails(row.dataset.customerId);
    });

    byId('addCustomerButton').addEventListener('click', () => openForm());
    byId('closeFormButton').addEventListener('click', closeForm);
    byId('cancelFormButton').addEventListener('click', closeForm);
    byId('customerForm').addEventListener('submit', saveCustomer);

    byId('closeDetailButton').addEventListener('click', closeDetails);
    byId('dismissDetailButton').addEventListener('click', closeDetails);
    byId('editCustomerButton').addEventListener('click', () => openForm(state.selectedId));
    byId('deleteCustomerButton').addEventListener('click', deleteSelectedCustomer);

    ['formOverlay', 'detailOverlay'].forEach((id) => {
      const overlay = byId(id);
      overlay.addEventListener('click', (event) => {
        if (event.target !== overlay) return;
        if (id === 'formOverlay') closeForm();
        if (id === 'detailOverlay') closeDetails();
      });
    });

    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;

      if (!byId('formOverlay').classList.contains('hidden')) {
        closeForm();
      } else if (!byId('detailOverlay').classList.contains('hidden')) {
        closeDetails();
      }
    });

    byId('sidebarToggle').addEventListener('click', () => {
      const collapsed = byId('app').classList.toggle('sidebar-collapsed');
      const button = byId('sidebarToggle');

      button.setAttribute('aria-expanded', String(!collapsed));
      button.setAttribute('aria-label', collapsed ? 'Expand sidebar' : 'Collapse sidebar');
      button.setAttribute('title', collapsed ? 'Expand sidebar' : 'Collapse sidebar');
    });

    window.addEventListener('hashchange', () => navigateTo(location.hash));
    navigateTo(location.hash);
  }

  function initialize() {
    installIcons();
    setUpEvents();
    renderAll();
  }

  initialize();
})();
