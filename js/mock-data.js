/** Customer fixtures; order aggregates are derived from shared orders. */
(function () {
  'use strict';
  function createMockCustomers(count = 1248) {
    return Array.from({ length: count }, (_, index) => ({
      id: 1001 + index, firstName: 'Customer', lastName: String(index + 1).padStart(3, '0'),
      phone: '09XX XXX ' + String(1000 + index), created_at: '2026-11-09 08:00',
      orders: 0, totalSpent: 0, isSample: true
    }));
  }
  window.LaundryMockData = { createMockCustomers };
})();
