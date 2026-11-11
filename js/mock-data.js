/**
 * Example customer records for the frontend shell.
 * All names and phone numbers here are placeholders, not actual customer data.
 * Replace this module with API responses when the backend is available.
 */
(function () {
  'use strict';

  const INITIAL_CUSTOMERS = [
    { orders: 12, totalSpent: 1240, lastContact: '2m ago', status: 'VIP' },
    { orders: 8, totalSpent: 860, lastContact: '8m ago', status: 'Active' },
    { orders: 5, totalSpent: 410, lastContact: '14m ago', status: 'At risk' },
    { orders: 3, totalSpent: 235, lastContact: '21m ago', status: 'At risk' },
    { orders: 9, totalSpent: 970, lastContact: '32m ago', status: 'Active' },
    { orders: 2, totalSpent: 178, lastContact: '45m ago', status: 'New' },
    { orders: 15, totalSpent: 1680, lastContact: '1h ago', status: 'VIP' }
  ];

  function createMockCustomer(index) {
    const serial = String(index + 1).padStart(3, '0');
    const preset = INITIAL_CUSTOMERS[index];

    const status = preset
      ? preset.status
      : index < 22
        ? 'At risk'
        : index < 107
          ? 'New'
          : index % 11 === 0
            ? 'VIP'
            : 'Active';

    return {
      id: `sample-${serial}`,
      firstName: 'Customer',
      lastName: serial,
      phone: `09XX XXX ${String(1000 + index).slice(-4)}`,
      status,
      orders: preset ? preset.orders : (index * 7) % 26 + 1,
      totalSpent: preset ? preset.totalSpent : 90 + (index * 79) % 4680,
      lastContact: preset ? preset.lastContact : `${index % 48 + 1}h ago`,
      isSample: true
    };
  }

  function createMockCustomers(count = 1248) {
    return Array.from({ length: count }, (_, index) => createMockCustomer(index));
  }

  // One explicit namespace avoids scattering demo variables over window.
  window.LaundryMockData = { createMockCustomers };
})();
