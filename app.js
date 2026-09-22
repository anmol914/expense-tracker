(() => {
  "use strict";

  /* ----------------------------------------------------------
     Data model
     ---------------------------------------------------------- */
  const CATEGORIES = [
    { id: "food",          label: "Food",          color: "var(--cat-food)",          hex: "#e2a33d" },
    { id: "transport",     label: "Transport",     color: "var(--cat-transport)",     hex: "#5b9bd1" },
    { id: "housing",       label: "Housing",       color: "var(--cat-housing)",       hex: "#9b8ad1" },
    { id: "utilities",     label: "Utilities",     color: "var(--cat-utilities)",     hex: "#36b88c" },
    { id: "entertainment", label: "Entertainment", color: "var(--cat-entertainment)", hex: "#d1738a" },
    { id: "health",        label: "Health",        color: "var(--cat-health)",        hex: "#6fbf73" },
    { id: "shopping",      label: "Shopping",      color: "var(--cat-shopping)",      hex: "#cf9a5f" },
    { id: "other",         label: "Other",         color: "var(--cat-other)",         hex: "#8f959c" },
  ];
  const catById = (id) => CATEGORIES.find((c) => c.id === id) || CATEGORIES[CATEGORIES.length - 1];

  const STORE_KEY_EXPENSES = "ledger.expenses.v1";
  const STORE_KEY_BUDGETS = "ledger.budgets.v1";

  const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

  function loadExpenses() {
    try {
      const raw = localStorage.getItem(STORE_KEY_EXPENSES);
      return raw ? JSON.parse(raw) : seedExpenses();
    } catch {
      return seedExpenses();
    }
  }
  function saveExpenses(list) {
    try { localStorage.setItem(STORE_KEY_EXPENSES, JSON.stringify(list)); } catch {}
  }
  function loadBudgets() {
    try {
      const raw = localStorage.getItem(STORE_KEY_BUDGETS);
      return raw ? JSON.parse(raw) : defaultBudgets();
    } catch {
      return defaultBudgets();
    }
  }
  function saveBudgets(obj) {
    try { localStorage.setItem(STORE_KEY_BUDGETS, JSON.stringify(obj)); } catch {}
  }
  function defaultBudgets() {
    return { food: 400, transport: 150, housing: 1200, utilities: 200, entertainment: 100, health: 100, shopping: 150, other: 0 };
  }

  // A little seed data so the app isn't empty on first load.
  function seedExpenses() {
    const today = new Date();
    const y = today.getFullYear(), m = today.getMonth();
    const d = (day) => new Date(y, m, day).toISOString().slice(0, 10);
    return [
      { id: uid(), date: d(2), category: "housing", description: "Rent", amount: 1150 },
      { id: uid(), date: d(3), category: "food", description: "Groceries", amount: 62.4 },
      { id: uid(), date: d(4), category: "transport", description: "Metro card", amount: 25 },
      { id: uid(), date: d(6), category: "utilities", description: "Electricity bill", amount: 58.2 },
      { id: uid(), date: d(8), category: "entertainment", description: "Movie tickets", amount: 24 },
      { id: uid(), date: d(10), category: "food", description: "Groceries", amount: 71.1 },
      { id: uid(), date: d(12), category: "shopping", description: "New shoes", amount: 89 },
      { id: uid(), date: d(14), category: "food", description: "Dinner out", amount: 38.5 },
      { id: uid(), date: d(16), category: "health", description: "Pharmacy", amount: 19.75 },
    ];
  }

  let expenses = loadExpenses();
  let budgets = loadBudgets();

  const now = new Date();
  let viewYear = now.getFullYear();
  let viewMonth = now.getMonth(); // 0-indexed

  /* ----------------------------------------------------------
     DOM refs
     ---------------------------------------------------------- */
  const $ = (sel) => document.querySelector(sel);
  const form = $("#expenseForm");
  const amountInput = $("#amount");
  const descInput = $("#description");
  const categorySelect = $("#category");
  const dateInput = $("#date");
  const monthLabel = $("#monthLabel");
  const totalSpentEl = $("#totalSpent");
  const alertBanner = $("#alertBanner");
  const alertList = $("#alertList");
  const budgetListEl = $("#budgetList");
  const ledgerBody = $("#ledgerBody");
  const ledgerEmpty = $("#ledgerEmpty");
  const categoryEmpty = $("#categoryEmpty");
  const entryCount = $("#entryCount");
  const budgetDialog = $("#budgetDialog");
  const budgetFields = $("#budgetFields");
  const budgetForm = $("#budgetForm");

  const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];

  /* ----------------------------------------------------------
     Init static UI
     ---------------------------------------------------------- */
  function populateCategorySelect() {
    categorySelect.innerHTML = CATEGORIES.map((c) => `<option value="${c.id}">${c.label}</option>`).join("");
  }
  function setDefaultDate() {
    dateInput.value = new Date().toISOString().slice(0, 10);
  }

  /* ----------------------------------------------------------
     Derived data helpers
     ---------------------------------------------------------- */
  function expensesForMonth(year, month) {
    return expenses
      .filter((e) => {
        const d = new Date(e.date + "T00:00:00");
        return d.getFullYear() === year && d.getMonth() === month;
      })
      .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  }

  function totalsByCategory(monthExpenses) {
    const totals = {};
    CATEGORIES.forEach((c) => (totals[c.id] = 0));
    monthExpenses.forEach((e) => { totals[e.category] = (totals[e.category] || 0) + Number(e.amount); });
    return totals;
  }

  function fmtMoney(n) {
    const sign = n < 0 ? "-" : "";
    return `${sign}₹${Math.abs(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  /* ----------------------------------------------------------
     Render: header / month nav
     ---------------------------------------------------------- */
  function renderHeader(monthExpenses) {
    monthLabel.textContent = `${MONTH_NAMES[viewMonth]} ${viewYear}`;
    const total = monthExpenses.reduce((s, e) => s + Number(e.amount), 0);
    const budgetTotal = Object.values(budgets).reduce((s, v) => s + Number(v || 0), 0);
    totalSpentEl.textContent = fmtMoney(total);
    totalSpentEl.classList.remove("over", "warn");
    if (budgetTotal > 0) {
      if (total > budgetTotal) totalSpentEl.classList.add("over");
      else if (total > budgetTotal * 0.9) totalSpentEl.classList.add("warn");
    }
  }

  /* ----------------------------------------------------------
     Render: budget alerts
     ---------------------------------------------------------- */
  function renderAlerts(catTotals) {
    const items = [];
    CATEGORIES.forEach((c) => {
      const budget = Number(budgets[c.id] || 0);
      if (budget <= 0) return;
      const spent = catTotals[c.id] || 0;
      const pct = spent / budget;
      if (pct >= 1) {
        items.push(`<div class="alert-item"><strong>${c.label}</strong> is over budget — ${fmtMoney(spent)} of ${fmtMoney(budget)} spent.</div>`);
      } else if (pct >= 0.9) {
        items.push(`<div class="alert-item"><strong>${c.label}</strong> is at ${Math.round(pct * 100)}% of its ${fmtMoney(budget)} budget.</div>`);
      }
    });
    if (items.length) {
      alertList.innerHTML = items.join("");
      alertBanner.hidden = false;
    } else {
      alertBanner.hidden = true;
      alertList.innerHTML = "";
    }
  }

  /* ----------------------------------------------------------
     Render: budgets panel
     ---------------------------------------------------------- */
  function renderBudgets(catTotals) {
    budgetListEl.innerHTML = CATEGORIES.map((c) => {
      const budget = Number(budgets[c.id] || 0);
      const spent = catTotals[c.id] || 0;
      const pct = budget > 0 ? Math.min(spent / budget, 1) : 0;
      let fillColor = "var(--mint)";
      if (budget > 0) {
        if (spent / budget >= 1) fillColor = "var(--red)";
        else if (spent / budget >= 0.9) fillColor = "var(--amber)";
      }
      const rightSide = budget > 0
        ? `<span class="budget-figures"><span class="spent">${fmtMoney(spent)}</span> / ${fmtMoney(budget)}</span>`
        : `<span class="budget-figures">${fmtMoney(spent)} <span class="no-budget-note">no limit</span></span>`;
      return `
        <li class="budget-row">
          <div class="budget-row-top">
            <span class="budget-cat"><span class="cat-dot" style="background:${c.color}"></span>${c.label}</span>
            ${rightSide}
          </div>
          <div class="budget-track"><div class="budget-fill" style="width:${budget > 0 ? pct * 100 : (spent > 0 ? 100 : 0)}%; background:${budget > 0 ? fillColor : "var(--line)"}"></div></div>
        </li>`;
    }).join("");
  }

  /* ----------------------------------------------------------
     Render: ledger table
     ---------------------------------------------------------- */
  let lastAddedId = null;

  function renderLedger(monthExpenses) {
    entryCount.textContent = `${monthExpenses.length} ${monthExpenses.length === 1 ? "entry" : "entries"}`;

    if (!monthExpenses.length) {
      ledgerBody.innerHTML = "";
      ledgerEmpty.hidden = false;
      return;
    }
    ledgerEmpty.hidden = true;

    let running = 0;
    const rows = monthExpenses.map((e) => {
      running += Number(e.amount);
      const c = catById(e.category);
      const isNew = e.id === lastAddedId;
      const d = new Date(e.date + "T00:00:00");
      const dateStr = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
      return `
        <tr data-id="${e.id}" class="${isNew ? "row-new" : ""}">
          <td class="col-date">${dateStr}</td>
          <td class="col-desc">${escapeHtml(e.description)}</td>
          <td class="col-cat"><span class="cat-pill"><span class="cat-dot" style="background:${c.color}"></span>${c.label}</span></td>
          <td class="col-amt">${fmtMoney(Number(e.amount))}</td>
          <td class="col-run">${fmtMoney(running)}</td>
          <td class="col-del"><button class="row-delete" aria-label="Delete entry" data-id="${e.id}">✕</button></td>
        </tr>`;
    });
    ledgerBody.innerHTML = rows.join("");
    lastAddedId = null;
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  /* ----------------------------------------------------------
     Charts
     ---------------------------------------------------------- */
  let categoryChart, trendChart;

  function resolveVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function renderCategoryChart(catTotals) {
    const entries = CATEGORIES
      .map((c) => ({ ...c, value: catTotals[c.id] || 0 }))
      .filter((c) => c.value > 0);

    categoryEmpty.hidden = entries.length > 0;
    const canvas = $("#categoryChart");
    canvas.style.display = entries.length ? "block" : "none";

    if (categoryChart) categoryChart.destroy();
    if (!entries.length) return;

    categoryChart = new Chart(canvas.getContext("2d"), {
      type: "doughnut",
      data: {
        labels: entries.map((c) => c.label),
        datasets: [{
          data: entries.map((c) => c.value),
          backgroundColor: entries.map((c) => c.hex),
          borderColor: resolveVar("--surface"),
          borderWidth: 2,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: "62%",
        plugins: {
          legend: {
            position: "right",
            labels: {
              color: resolveVar("--ink-dim"),
              boxWidth: 8,
              boxHeight: 8,
              usePointStyle: true,
              pointStyle: "circle",
              font: { family: "Manrope", size: 11 },
              padding: 10,
            },
          },
          tooltip: {
            callbacks: {
              label: (ctx) => ` ${ctx.label}: ${fmtMoney(ctx.parsed)}`,
            },
          },
        },
      },
    });
  }

  function renderTrendChart(monthExpenses) {
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const perDay = new Array(daysInMonth).fill(0);
    monthExpenses.forEach((e) => {
      const day = Number(e.date.slice(8, 10));
      perDay[day - 1] += Number(e.amount);
    });

    const canvas = $("#trendChart");
    if (trendChart) trendChart.destroy();
    trendChart = new Chart(canvas.getContext("2d"), {
      type: "bar",
      data: {
        labels: perDay.map((_, i) => i + 1),
        datasets: [{
          data: perDay,
          backgroundColor: resolveVar("--mint"),
          borderRadius: 2,
          maxBarThickness: 14,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              title: (items) => `Day ${items[0].label}`,
              label: (ctx) => ` ${fmtMoney(ctx.parsed.y)}`,
            },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: resolveVar("--muted"), font: { family: "IBM Plex Mono", size: 9 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 10 },
          },
          y: {
            grid: { color: resolveVar("--line-soft") },
            ticks: { color: resolveVar("--muted"), font: { family: "IBM Plex Mono", size: 9 }, callback: (v) => `₹${v}` },
            beginAtZero: true,
          },
        },
      },
    });
  }

  /* ----------------------------------------------------------
     Master render
     ---------------------------------------------------------- */
  function renderAll() {
    const monthExpenses = expensesForMonth(viewYear, viewMonth);
    const catTotals = totalsByCategory(monthExpenses);

    renderHeader(monthExpenses);
    renderAlerts(catTotals);
    renderBudgets(catTotals);
    renderLedger(monthExpenses);
    renderCategoryChart(catTotals);
    renderTrendChart(monthExpenses);
  }

  /* ----------------------------------------------------------
     Events
     ---------------------------------------------------------- */
  form.addEventListener("submit", (ev) => {
    ev.preventDefault();
    const amount = parseFloat(amountInput.value);
    if (!amount || amount <= 0) return;

    const entry = {
      id: uid(),
      date: dateInput.value || new Date().toISOString().slice(0, 10),
      category: categorySelect.value,
      description: descInput.value.trim() || "Untitled",
      amount,
    };
    expenses.push(entry);
    saveExpenses(expenses);
    lastAddedId = entry.id;

    // Jump the view to the month of the new entry so it's visible.
    const d = new Date(entry.date + "T00:00:00");
    viewYear = d.getFullYear();
    viewMonth = d.getMonth();

    form.reset();
    setDefaultDate();
    renderAll();
  });

  ledgerBody.addEventListener("click", (ev) => {
    const btn = ev.target.closest(".row-delete");
    if (!btn) return;
    const id = btn.dataset.id;
    expenses = expenses.filter((e) => e.id !== id);
    saveExpenses(expenses);
    renderAll();
  });

  $("#prevMonth").addEventListener("click", () => {
    viewMonth -= 1;
    if (viewMonth < 0) { viewMonth = 11; viewYear -= 1; }
    renderAll();
  });
  $("#nextMonth").addEventListener("click", () => {
    viewMonth += 1;
    if (viewMonth > 11) { viewMonth = 0; viewYear += 1; }
    renderAll();
  });

  /* ----------------------------------------------------------
     Budget dialog
     ---------------------------------------------------------- */
  $("#editBudgets").addEventListener("click", () => {
    budgetFields.innerHTML = CATEGORIES.map((c) => `
      <div class="budget-field-row">
        <label for="bud-${c.id}"><span class="cat-dot" style="background:${c.color}"></span>${c.label}</label>
        <input type="number" min="0" step="1" id="bud-${c.id}" value="${Number(budgets[c.id] || 0)}" />
      </div>
    `).join("");
    budgetDialog.showModal();
  });

  $("#cancelBudgets").addEventListener("click", () => budgetDialog.close());

  budgetForm.addEventListener("submit", (ev) => {
    ev.preventDefault();
    CATEGORIES.forEach((c) => {
      const el = document.getElementById(`bud-${c.id}`);
      budgets[c.id] = el ? Math.max(0, parseFloat(el.value) || 0) : 0;
    });
    saveBudgets(budgets);
    budgetDialog.close();
    renderAll();
  });

  /* ----------------------------------------------------------
     Boot
     ---------------------------------------------------------- */
  populateCategorySelect();
  setDefaultDate();
  renderAll();
})();
