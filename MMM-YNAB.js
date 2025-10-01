Module.register("MMM-YNAB", {
    result: [],
    loading: true,
    error: null,
    currentTransactionIndex: 0, // Track which set of transactions to show
    lastUpdated: null, // Track when data was last updated
    defaults: {
        token: "",
        budgetId: null, // Optional: specific budget ID to use
        categories: [
            "Household",
            "Pets",
            "Grocery",
            "Lunch",
            "Kids Clothes",
            "Restaurants",
            "Spontaneous Fun"
        ],
        groups: [], // Optional: specific category groups to display (e.g., ["Monthly Bills", "True Expenses"])
        excludedCategories: ["Rent"], // Categories to exclude from all calculations
        excludedGroups: [
            "Monthly Bills", "Bills", "Fixed Expenses"
        ], // Category groups to exclude from all calculations
        showUncleared: true, // Include uncleared transactions (optional, default: true)
        updateInterval: 90000, // 90 seconds, now configurable
        showCurrency: true,
        currencyFormat: "USD",
        showGroupSummaries: true, // Show category group totals (optional)
        transactionAnimationDelay: 15000, // Animation delay in milliseconds (15 seconds)
        excludeNonBudgetAccounts: true, // Exclude tracking accounts like 401k, investment accounts, etc. (default: true)
        recentTransactionDays: 6 // Number of days to show in recent transactions (default: 6)
    },

    start: function () {
        this.loading = true;
        this.error = null;
        this.currentTransactionIndex = 0;
        this.lastUpdated = null;
        this.sendSocketNotification('YNAB_SET_CONFIG', this.config);

        // Start transaction rotation timer
        this.startTransactionRotation();
    },

    stop: function () { // Clean up when module is stopped
        this.sendSocketNotification('YNAB_CLEANUP');
        this.stopTransactionRotation();
    },

    startTransactionRotation: function () {
        this.rotationTimer = setInterval(() => {
            this.rotateTransactions();
        }, this.config.transactionAnimationDelay); // Use configurable delay
    },

    stopTransactionRotation: function () {
        if (this.rotationTimer) {
            clearInterval(this.rotationTimer);
            this.rotationTimer = null;
        }
    },

    rotateTransactions: function () {
        if (this.result.lastTransactions && this.result.lastTransactions.length > 0) {
            const visibleRows = 3; // Number of rows visible at once
            const maxIndex = Math.max(0, this.result.lastTransactions.length - visibleRows);
            // Maximum index to show

            // Only animate if we have more transactions than visible rows
            if (this.result.lastTransactions.length > visibleRows) { // Increment the index
                this.currentTransactionIndex = this.currentTransactionIndex + 1;

                // If we've reached the end, smoothly transition back to the beginning
                if (this.currentTransactionIndex > maxIndex) {
                    this.currentTransactionIndex = 0;
                }

                // Find the transactions container and animate the scroll
                const container = document.querySelector('.ynab-transactions-container');
                if (container) {
                    const rowHeight = 26; // Height per row (78px / 3 rows)
                    const translateY = -(this.currentTransactionIndex * rowHeight);
                    container.style.transform = `translateY(${translateY}px)`;
                }
            }
        }
    },

    getDom: function () {
        const wrapper = document.createElement("div");
        wrapper.classList = ["xsmall"];

        if (this.error) {
            wrapper.innerHTML = `<div class="ynab-error">Error: ${
                this.error
            }</div>`;
            return wrapper;
        }

        // Only show loading if we have no existing data
        if (this.loading && (!this.result.items || this.result.items.length === 0)) {
            wrapper.innerHTML = '<div class="ynab-loading">Loading YNAB data...</div>';
            return wrapper;
        }

        if (!this.result.items || this.result.items.length === 0) {
            wrapper.innerHTML = '<div class="ynab-no-data">No category data available</div>';
            return wrapper;
        }

        let html = '';

        // Add spending section if spending data is available
        if (this.result.spending) {
            html += '<div class="ynab-section">';
            html += '<div class="ynab-section-title">Discretionary Spending</div>';

            const spending = this.result.spending;
            const formatAmount = (amount) => {
                return this.config.showCurrency ? `$${
                    amount.toFixed(2)
                }` : amount.toFixed(2);
            };

            if (spending.today > 0) {
                html += `<div class="ynab-row"><span class="ynab-name">Today</span><span class="ynab-balance spending">(${
                    formatAmount(spending.today)
                })</span></div>`;
            }
            if (spending.yesterday > 0) {
                html += `<div class="ynab-row"><span class="ynab-name">Yesterday</span><span class="ynab-balance spending">(${
                    formatAmount(spending.yesterday)
                })</span></div>`;
            }

            // Calculate and display total from displayed transactions
            const daysToShow = this.config.recentTransactionDays || 6;
            const useRollingWeek = daysToShow < 7;

            if (this.result.lastTransactions && this.result.lastTransactions.length > 0) { // Always sum up the displayed transactions for the total
                const transactionTotal = this.result.lastTransactions.reduce((sum, transaction) => {
                    return sum + transaction.amount;
                }, 0);

                if (transactionTotal > 0) {
                    if (useRollingWeek) {
                        html += `<div class="ynab-row"><span class="ynab-name">Past ${daysToShow} Days</span><span class="ynab-balance spending">(${
                            formatAmount(transactionTotal)
                        })</span></div>`;
                    } else {
                        html += `<div class="ynab-row"><span class="ynab-name">This Week</span><span class="ynab-balance spending">(${
                            formatAmount(transactionTotal)
                        })</span></div>`;
                    }
                }
            }

            // Add recent transactions as sub-list
            if (this.result.lastTransactions && this.result.lastTransactions.length > 0) {
                html += '<div class="ynab-subsection">';
                html += `<div class="ynab-subsection-title">Past ${daysToShow} Days</div>`;

                // Create a fixed wrapper container
                html += '<div class="ynab-transactions-wrapper">';

                // Create a container for smooth scrolling animation
                const visibleRows = 3; // Number of rows visible at once
                const maxIndex = Math.max(0, this.result.lastTransactions.length - visibleRows); // Maximum index to show
                const clampedIndex = Math.min(this.currentTransactionIndex, maxIndex);
                const initialTranslateY = -(clampedIndex * 26); // 26px per row
                html += `<div class="ynab-transactions-container" style="transform: translateY(${initialTranslateY}px);">`;

                // Show all transactions in the container (only 3 will be visible due to overflow)
                this.result.lastTransactions.forEach((transaction, index) => {
                    // Parse the date string directly without timezone conversion (same as backend)
                    const dateParts = transaction.date.split('-');
                    const year = parseInt(dateParts[0]);
                    const month = parseInt(dateParts[1]) - 1; // Month is 0-indexed
                    const day = parseInt(dateParts[2]);

                    const transactionDate = new Date(year, month, day);
                    // Format date directly to avoid timezone issues
                    const formattedDate = `${
                        month + 1
                    }/${day}`;

                    // Build the name span with category if available
                    let nameContent = `${formattedDate} - ${
                        transaction.payee
                    }`;
                    if (transaction.category) {
                        nameContent += `<span class="ynab-category">${
                            transaction.category
                        }</span>`;
                    }

                    const formattedAmount = formatAmount(transaction.amount);

                    html += `<div class="ynab-row ynab-sub" data-index="${index}"><span class="ynab-name">${nameContent}</span><span class="ynab-balance spending">(${formattedAmount})</span></div>`;
                });

                html += '</div>';
                html += '</div>';
                html += '</div>';
            }

            html += '</div>';
        }

        // Add combined category balances section
        html += '<div class="ynab-section">';
        html += '<div class="ynab-section-title">Category Balances</div>';

        const formatAmount = (amount) => {
            return this.config.showCurrency ? `$${
                amount.toFixed(2)
            }` : amount.toFixed(2);
        };

        // Add individual category balances first
        const sortedItems = this.result.items.sort((a, b) => a.name.localeCompare(b.name));
        const itemsHtml = sortedItems.map(item => {
            const balance = item.balance / 1000;
            const formattedBalance = this.config.showCurrency ? `$${
                balance.toFixed(2)
            }` : balance.toFixed(2);

            const balanceClass = balance < 0 ? 'ynab-balance negative' : 'ynab-balance';

            // Get monthly spending for this category
            let monthlySpentHtml = '';
            if (this.result.monthlySpending && this.result.monthlySpending.categories) {
                const monthlySpent = (this.result.monthlySpending.categories[item.id] || 0) / 1000;
                const formattedMonthlySpent = this.config.showCurrency ? `$${
                    monthlySpent.toFixed(2)
                }` : monthlySpent.toFixed(2);

                const spentClass = monthlySpent > 0 ? 'ynab-monthly-spent' : 'ynab-monthly-spent-zero';
                monthlySpentHtml = `<span class="${spentClass}">(${formattedMonthlySpent})</span>`;
            }

            return `<div class="ynab-row"><span class="ynab-name">${
                item.name
            }</span>${monthlySpentHtml}<span class="${balanceClass}">${formattedBalance}</span></div>`;
        }).join('');

        html += itemsHtml;

        // Add group summaries at the bottom (if enabled)
        if (this.result.groupSummaries && this.result.groupSummaries.length > 0 && this.config.showGroupSummaries) {
            this.result.groupSummaries.forEach(group => { // Get monthly spending for this group
                let monthlySpentHtml = '';
                if (this.result.monthlySpending && this.result.monthlySpending.groups) {
                    const monthlySpent = (this.result.monthlySpending.groups[group.id] || 0) / 1000;
                    const formattedMonthlySpent = this.config.showCurrency ? `$${
                        monthlySpent.toFixed(2)
                    }` : monthlySpent.toFixed(2);

                    const spentClass = monthlySpent > 0 ? 'ynab-monthly-spent' : 'ynab-monthly-spent-zero';
                    monthlySpentHtml = `<span class="${spentClass}">(${formattedMonthlySpent})</span>`;
                }

                html += `<div class="ynab-row ynab-group"><span class="ynab-name">${
                    group.name
                }</span>${monthlySpentHtml}<span class="ynab-balance">${
                    formatAmount(group.totalAvailable)
                }</span></div>`;
            });
        }

        html += '</div>';

        // Add subtle loading indicator if currently loading
        if (this.loading) {
            html += '<div class="ynab-loading-subtle">Updating...</div>';
        }

        // Add last updated timestamp
        if (this.lastUpdated) {
            const formattedDate = this.lastUpdated.toLocaleDateString('en-US', {
                month: 'numeric',
                day: '2-digit'
            });
            const formattedTime = this.lastUpdated.toLocaleTimeString('en-US', {
                hour: 'numeric',
                minute: '2-digit',
                hour12: false
            });
            html += `<div class="ynab-last-updated">Updated: ${formattedDate} ${formattedTime}</div>`;
        }

        wrapper.innerHTML = html;
        return wrapper;
    },

    socketNotificationReceived: function (notification, payload) {
        switch (notification) {
            case "YNAB_UPDATE":
                this.result = payload;
                this.loading = false;
                this.error = null;
                this.lastUpdated = new Date(); // Set timestamp when data is updated
                this.updateDom(0);
                break;

            case "YNAB_ERROR":
                this.error = payload.message || "Unknown error occurred";
                this.loading = false;
                this.updateDom(0);
                break;

            case "YNAB_LOADING":
                this.loading = true;
                this.error = null;
                this.updateDom(0);
                break;
        }
    },

    getStyles: function () {
        return [this.file('MMM-YNAB.css')];
    }
});
