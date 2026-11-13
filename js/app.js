
(function () {
  'use strict';

  const PAGE_SIZE = 7;
  const STORAGE_KEY = 'laundry-customer-ui-v3';
  const legacyIds = new Map();
  function resolveCustomerId(id) {
    if (typeof id === 'number' || /^\d+$/.test(String(id))) return Number(id);
    if (String(id).startsWith('source-')) return Number(String(id).slice(7));
    if (String(id).startsWith('sample-')) return 1000 + Number(String(id).slice(7));
    if (!legacyIds.has(id)) legacyIds.set(id, 10000 + legacyIds.size);
    return legacyIds.get(id);
  }
  function customerRecord(customer) {
    return { customer_id: customer.id, first_name: customer.firstName, last_name: customer.lastName,
      contact_number: customer.phone || null, created_at: customer.created_at };
  }
  function customerView(record) {
    return { id: resolveCustomerId(record.customer_id ?? record.id), firstName: record.first_name ?? record.firstName,
      lastName: record.last_name ?? record.lastName, phone: record.contact_number ?? record.phone ?? '',
      _version: record._version, created_at: record.created_at || '2026-11-09 08:00', orders: 0, totalSpent: 0, isSample: record.isSample ?? false };
  }

  // Small inline SVG icons eliminate external icon dependencies.
  const ICON_PATHS = {
    'receipt': '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z"/><path d="M9 7h6M9 11h6M9 15h3"/>',
    'download': '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
    'package': '<path d="m3 7 9-4 9 4v10l-9 4-9-4V7Zm0 0 9 4 9-4M12 11v10M7 5l9 4"/>',
    'wallet': '<rect x="3" y="5" width="18" height="15" rx="2"/><path d="M3 8V5l14-3v3m4 6h-6v5h6m-3-3.5h.01"/>',
    'scale': '<path d="M12 3v17M5 20h14M3 7h18M6 7l-4 8h8L6 7Zm12 0-4 8h8l-4-8Z"/>',
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
    return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(Number(amount));
  }

  function displayName(customer) {
    return `${customer.firstName} ${customer.lastName}`.trim();
  }

  // ---------------------------------------------------------------------------
  // Local demo data: replace this section with the backend CustomerService API.
  // ---------------------------------------------------------------------------

  function loadChanges() {
    const emptyChanges = { added: [], edited: {}, deleted: [] };
    if(window.LaundryBackend)return {...emptyChanges,added:window.LaundryBackend.data.customers.map(customerView)};

    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || localStorage.getItem('laundry-customer-ui-v2') || '{}');
      Object.entries(saved.legacy_ids || {}).forEach(([id, value]) => legacyIds.set(id, value));

      return {
        added: Array.isArray(saved.added) ? saved.added.map(customerView) : [],
        edited: Object.fromEntries(Object.entries(saved.edited || {}).map(([id, record]) => [resolveCustomerId(record.customer_id ?? id), customerView(record)])),
        deleted: Array.isArray(saved.deleted) ? saved.deleted.map(resolveCustomerId) : []
      };
    } catch (error) {
      console.warn('Saved demo data could not be loaded:', error);
      return emptyChanges;
    }
  }

  function saveChanges() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ added: state.changes.added.map(customerRecord), edited: Object.fromEntries(Object.entries(state.changes.edited).map(([id, record]) => [id, customerRecord(record)])), deleted: state.changes.deleted, legacy_ids: Object.fromEntries(legacyIds) }));
      return true;
    } catch (error) {
      console.warn('Demo data could not be saved:', error);
      showToast('Browser storage is unavailable. Changes may not persist.');
      return false;
    }
  }

  function refreshCustomers() {
    if(window.LaundryBackend)state.changes={added:window.LaundryBackend.data.customers.map(customerView),edited:{},deleted:[]};
    const sampleCustomers = window.LaundryBackend ? [] : [...(window.LaundryWorkspace?.seedCustomers || []), ...window.LaundryMockData.createMockCustomers()];
    const deletedIds = new Set(state.changes.deleted);

    const updatedSamples = sampleCustomers.map((customer) => {
      return state.changes.edited[customer.id] || customer;
    });

    state.customers = [
      ...state.changes.added,
      ...updatedSamples
    ].filter((customer) => !deletedIds.has(customer.id)).map((customer) => ({ ...customer }));
    if (window.LaundryWorkspace) {
      const orders = window.LaundryWorkspace.getOrders();
      state.customers.forEach((customer) => {
        const linked = orders.filter((order) => order.customer_id === customer.id);
        customer.orders = linked.length;
        customer.totalSpent = linked.reduce((sum, order) => sum + order.total_amount, 0);
      });
    }
  }

  function getCustomer(id) {
    return state.customers.find((customer) => customer.id === Number(id));
  }

  // ---------------------------------------------------------------------------
  // List filtering and table rendering
  // ---------------------------------------------------------------------------

  function filteredCustomers() {
    const query = state.search.trim().toLowerCase();

    return state.customers.filter((customer) => {

      const searchableText = [
        customer.firstName,
        customer.lastName,
        displayName(customer),
        customer.phone
      ].join(' ').toLowerCase();

      return searchableText.includes(query);
    });
  }

  function renderCustomerRow(customer) {
    const subtitle = customer.isSample ? 'Sample customer record' : 'Customer record';
    const services = window.LaundryWorkspace?.customerServices?.(customer.id) || [];

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
              <strong>${escapeHTML(displayName(customer))}</strong><button class="text-button customer-edit-link" type="button" data-edit-customer="${customer.id}" aria-label="Edit ${escapeHTML(displayName(customer))}">Edit customer</button>
              <small>${escapeHTML(subtitle)}</small>
            </span>
          </div>
        </td>
        <td>${escapeHTML(customer.phone || 'Not provided')}</td>
        <td class="numeric-cell">${formatNumber(customer.orders)}</td>
        <td class="customer-services">${escapeHTML(services.join(', ') || 'No orders yet')}</td>
        <td class="numeric-cell">${formatMoney(customer.totalSpent)}</td>
        <td>${escapeHTML(window.LaundryDates.format(customer.created_at, true))}</td>
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
    byId('clearCustomerSearch').classList.toggle('hidden', !state.search);
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
    const focusedCustomer = document.activeElement?.closest('[data-customer-id]')?.dataset.customerId;
    refreshCustomers();
    renderTable();
    if (state.selectedId) renderCustomerOrders();
    if (focusedCustomer) document.querySelector(`[data-customer-id="${CSS.escape(focusedCustomer)}"]`)?.focus();
  }

  function clearFilters() {
    state.search = '';
    state.page = 1;

    byId('searchInput').value = '';

    renderTable();
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
    byId('app').inert = anyOpen;
  }

  function openForm(customerId = null) {
    const customer = customerId ? getCustomer(customerId) : null;

    state.previousFocus = document.activeElement;
    state.editingId = customerId;
    byId('customerForm').reset();
    byId('formError').classList.add('hidden');
    ['firstName', 'lastName', 'phoneNumber'].forEach((id) => byId(id).removeAttribute('aria-invalid'));

    byId('formTitle').textContent = customer ? 'Edit customer' : 'Add customer';
    byId('saveCustomerButton').textContent = customer ? 'Save changes' : 'Save customer';

    byId('firstName').value = customer?.firstName || '';
    byId('lastName').value = customer?.lastName || '';
    byId('phoneNumber').value = customer?.phone || '';


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

  async function saveCustomer(event) {
    event.preventDefault();
    const before = JSON.parse(JSON.stringify(state.changes));

    const firstName = byId('firstName').value.trim();
    const lastName = byId('lastName').value.trim();
    const phone = byId('phoneNumber').value.trim();


    if (!firstName || !lastName || firstName.length > 30 || lastName.length > 30 || phone.length > 30) {
      showFormError('Enter first and last names of up to 30 characters. Contact number is optional (up to 30 characters).');
      const invalid = !firstName || firstName.length > 30 ? 'firstName' : !lastName || lastName.length > 30 ? 'lastName' : 'phoneNumber';
      byId(invalid).setAttribute('aria-invalid', 'true');
      byId(invalid).setAttribute('aria-describedby', 'formError');
      byId(invalid).focus();
      return;
    }

    if(window.LaundryBackend) {
      try {
        const existing=state.editingId?getCustomer(state.editingId):null;
        const record=await window.LaundryPersistence.withBusy(byId('customerForm'),()=>window.LaundryBackend.request(existing?`/api/customers/${existing.id}`:'/api/customers',{method:existing?'PATCH':'POST',body:{first_name:firstName,last_name:lastName,contact_number:phone||null,_version:existing?._version}}));
        if(!record)return;
        const data=window.LaundryBackend.data;
        data.customers=existing?data.customers.map((item)=>item.customer_id===record.customer_id?record:item):[record,...data.customers];
        state.changes={added:data.customers.map(customerView),edited:{},deleted:[]};
        closeForm();clearFilters();renderAll();window.LaundryWorkspace.refreshViews();showToast(existing?'Customer updated.':'Customer created.');
      }catch(error){showFormError(error.message);}
      return;
    }
    if (state.editingId) {
      const existing = getCustomer(state.editingId);
      if (!existing) return;

      const updated = { ...existing, firstName, lastName, phone };
      // Persist historical values only; workspace orders are added during refresh.
      const linkedOrders = window.LaundryWorkspace?.getOrders().filter((order) => order.customer_id === existing.id) || [];
      updated.orders -= linkedOrders.length;
      updated.totalSpent = Math.round((updated.totalSpent - linkedOrders.reduce((sum, order) => sum + order.total_amount, 0)) * 100) / 100;
      const addedIndex = state.changes.added.findIndex((item) => item.id === existing.id);

      if (addedIndex !== -1) {
        state.changes.added[addedIndex] = updated;
      } else {
        state.changes.edited[existing.id] = updated;
      }

      if (!saveChanges()) { state.changes = before; showFormError('Customer was not saved. Allow browser storage and try again.'); return; }
      closeForm();
      renderAll();
      showToast('Customer updated successfully.');
      return;
    }

    const customer = {
      id: Math.max(9999, ...state.customers.map((item) => item.id), ...state.changes.deleted) + 1,
      firstName,
      lastName,
      phone,

      orders: 0,
      totalSpent: 0,
      created_at: window.LaundryWorkspace.localDate().replace('T', ' '),
      isSample: false
    };

    state.changes.added.unshift(customer);
    if (!saveChanges()) { state.changes = before; showFormError('Customer was not saved. Allow browser storage and try again.'); return; }
    closeForm();
    clearFilters();
    renderAll();
    showToast('Customer added successfully.');
  }

  function openCustomerDetails(customerId) {
    const customer = getCustomer(customerId);
    if (!customer) return;

    state.selectedId = customer.id;
    state.customerOrderPage = 1;
    state.previousFocus = document.activeElement;

    byId('detailName').textContent = displayName(customer);
    byId('detailSubheading').textContent = customer.isSample
      ? 'Sample customer record'
      : 'Customer record';

    const fields = [
      ['Phone number', customer.phone || 'Not provided'],

      ['Orders', formatNumber(customer.orders)],
      ['Order value', formatMoney(customer.totalSpent)],
      ['Customer since', window.LaundryDates.format(customer.created_at, true)]
    ];

    byId('detailFields').innerHTML = fields.map(([label, value]) => {
      return `
        <div class="detail-field">
          <dt>${escapeHTML(label)}</dt>
          <dd>${escapeHTML(value)}</dd>
        </div>
      `;
    }).join('');

    renderCustomerOrders();
    toggleOverlay('detailOverlay', true);
    byId('closeDetailButton').focus();
  }

  function closeDetails() {
    toggleOverlay('detailOverlay', false);
    const previousId = state.selectedId;
    state.selectedId = null;
    if (state.previousFocus?.isConnected) state.previousFocus.focus();
    else document.querySelector(`[data-customer-id="${previousId}"]`)?.focus();
  }

  function renderCustomerOrders() {
    const workspace = window.LaundryWorkspace;
    if (!workspace?.orderTableRows || !state.selectedId) return;
    const orders = workspace.getOrders().filter((order) => order.customer_id === state.selectedId).sort((a, b) => window.LaundryDates.timestamp(b.order_date) - window.LaundryDates.timestamp(a.order_date));
    const totalPages = Math.max(1, Math.ceil(orders.length / PAGE_SIZE));
    state.customerOrderPage = Math.min(state.customerOrderPage || 1, totalPages);
    const start = (state.customerOrderPage - 1) * PAGE_SIZE;
    byId('customerOrderHead').innerHTML = workspace.orderTableHead({ balance: true });
    byId('customerOrderRows').innerHTML = workspace.orderTableRows(orders.slice(start, start + PAGE_SIZE), { balance: true });
    byId('customerOrdersEmpty').classList.toggle('hidden', orders.length > 0);
    byId('customerOrdersResults').textContent = `${orders.length ? start + 1 : 0}–${Math.min(start + PAGE_SIZE, orders.length)} of ${orders.length} orders`;
    byId('customerOrdersPagination').innerHTML = `<button type="button" class="page-button" data-customer-order-page="${state.customerOrderPage - 1}" aria-label="Previous customer orders page" ${state.customerOrderPage === 1 ? 'disabled' : ''}>${icon('chevron-left')}</button><span>Page ${state.customerOrderPage} of ${totalPages}</span><button type="button" class="page-button" data-customer-order-page="${state.customerOrderPage + 1}" aria-label="Next customer orders page" ${state.customerOrderPage === totalPages ? 'disabled' : ''}>${icon('chevron-right')}</button>`;
  }

  function deleteSelectedCustomer() {
    const customer = getCustomer(state.selectedId);
    if (!customer) return;

    if (window.LaundryWorkspace?.getOrders().some((order) => order.customer_id === customer.id)) {
      showToast('This customer has orders. Keep their record to preserve order history.');
      return;
    }

    if (window.LaundryWorkspace) {
      window.LaundryWorkspace.confirmDelete(displayName(customer), () => finishDeleteCustomer(customer));
      return;
    }
  }

  async function finishDeleteCustomer(customer) {
    if(window.LaundryBackend) {
      try {await window.LaundryBackend.request(`/api/customers/${customer.id}`,{method:'DELETE',body:{_version:customer._version}});window.LaundryBackend.data.customers=window.LaundryBackend.data.customers.filter((record)=>record.customer_id!==customer.id);state.changes.added=window.LaundryBackend.data.customers.map(customerView);closeDetails();renderAll();window.LaundryWorkspace.refreshViews();showToast('Customer deleted.');}catch(error){showToast(error.message);}return;
    }
    const before = JSON.parse(JSON.stringify(state.changes));

    const addedIndex = state.changes.added.findIndex((item) => item.id === customer.id);

    if (addedIndex !== -1) {
      state.changes.added.splice(addedIndex, 1);
    } else {
      state.changes.deleted.push(customer.id);
      delete state.changes.edited[customer.id];
    }

    if (!saveChanges()) { state.changes = before; showToast('Customer was not deleted. Allow browser storage and try again.'); return; }
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
    if (hash === '#orders') { location.replace('#overview'); return; }
    const page = ['#overview', '#customers', '#transactions', '#settings'].includes(hash)
      ? hash.slice(1)
      : 'customers';

    byId('customerPage').classList.toggle('hidden', page !== 'customers');
    byId('otherPage').classList.toggle('hidden', page !== 'settings');
    byId('overviewPage').classList.toggle('hidden', page !== 'overview');
    if (byId('overviewTitle')) byId('overviewTitle').textContent = 'Overview';
    byId('transactionsPage').classList.toggle('hidden', page !== 'transactions');
    document.title = `${{overview: 'Overview', customers: 'Customers', transactions: 'Transactions', settings: 'Settings'}[page]} | BubbleWash`;

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
    byId('customerOrdersPagination').addEventListener('click', (event) => {
      const button = event.target.closest('[data-customer-order-page]');
      if (!button || button.disabled) return;
      state.customerOrderPage = Number(button.dataset.customerOrderPage);
      renderCustomerOrders();
      byId('customerOrdersPagination').querySelector('button:not([disabled])')?.focus();
    });
    byId('clearCustomerSearch').addEventListener('click', () => {
      byId('searchInput').value = '';
      state.search = '';
      state.page = 1;
      renderTable();
      byId('searchInput').focus();
    });
    byId('searchInput').addEventListener('input', (event) => {
      state.search = event.target.value;
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
      const edit = event.target.closest('[data-edit-customer]');
      if (edit) { openForm(Number(edit.dataset.editCustomer)); return; }
      const row = event.target.closest('[data-customer-id]');
      if (row) openCustomerDetails(row.dataset.customerId);
    });

    byId('customerRows').addEventListener('keydown', (event) => {
      if (event.target.closest('button')) return;
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
      if (event.key === 'Tab') {
        const overlay = document.querySelector('.modal-overlay:not(.hidden)');
        if (overlay) {
          const targets = [...overlay.querySelectorAll('button:not([disabled]), input, select, a[href], [tabindex="0"]')].filter((element) => element.getClientRects().length);
          const first = targets[0];
          const last = targets[targets.length - 1];
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
          if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        }
      }
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
  window.LaundryApp = {
    getCustomers: () => state.customers,
    getCustomerRecords: () => state.customers.map(customerRecord), resolveCustomerId,
    refresh: renderAll,
    icon, escape: escapeHTML, showToast, closeDetails,
    closeForm,
    navigateTo
  };
  window.LaundryCustomerCombobox.enhanceSearch(byId('searchInput'));
})();
