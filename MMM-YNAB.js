Module.register("MMM-YNAB", {
    result: [],
    loading: true,
    error: null,
    defaults: {
        token: "",
        budgetId: null, // Optional: specific budget ID to use
        categories: ["Household", "Pets", "Grocery", "Lunch", "Kids Clothes", "Restaurants", "Spontaneous Fun"],
        groups: [], // Optional: specific category groups to display (e.g., ["Monthly Bills", "True Expenses"])
        excludedCategories: ["Rent"], // Categories to exclude from spending calculations
        excludedGroups: ["Monthly Bills", "Bills", "Fixed Expenses"], // Category groups to exclude from spending calculations
        updateInterval: 90000, // 90 seconds, now configurable
        showCurrency: true,
        currencyFormat: "USD",
        showGroupSummaries: true // Show category group totals (optional)
    },

    start: function () {
        this.loading = true;
        this.error = null;
        this.sendSocketNotification('YNAB_SET_CONFIG', this.config);
    },

    stop: function () {
        // Clean up when module is stopped
        this.sendSocketNotification('YNAB_CLEANUP');
    },

    getDom: function () {
        const wrapper = document.createElement("div");
        wrapper.classList = ["xsmall"];

        if (this.error) {
            wrapper.innerHTML = `<div class="ynab-error">Error: ${this.error}</div>`;
            return wrapper;
        }

        // Only show loading if we have no existing data
        if (this.loading && (!this.result.items || this.result.items.length === 0)) {
            wrapper.innerHTML = '<div class="ynab-loading">Loading YNAB...</div>';
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
            html += '<div class="ynab-section-title">Spending</div>';
            
            const spending = this.result.spending;
            const formatAmount = (amount) => {
                return this.config.showCurrency ? 
                    `$${amount.toFixed(2)}` : 
                    amount.toFixed(2);
            };

            if (spending.today > 0) {
                html += `<div class="ynab-row"><span class="ynab-name">Today</span><span class="ynab-balance spending">(${formatAmount(spending.today)})</span></div>`;
            }
            if (spending.thisWeek > 0) {
                html += `<div class="ynab-row"><span class="ynab-name">This Week</span><span class="ynab-balance spending">(${formatAmount(spending.thisWeek)})</span></div>`;
            }
            if (spending.lastWeek > 0) {
                html += `<div class="ynab-row"><span class="ynab-name">Last Week</span><span class="ynab-balance spending">(${formatAmount(spending.lastWeek)})</span></div>`;
            }

            // Add recent transactions as sub-list
            if (this.result.lastTransactions && this.result.lastTransactions.length > 0) {
                html += '<div class="ynab-subsection">';
                html += '<div class="ynab-subsection-title">Recent</div>';
                
                this.result.lastTransactions.forEach(transaction => {
                    html += `<div class="ynab-row ynab-sub"><span class="ynab-name">${transaction.payee}</span><span class="ynab-balance spending">(${formatAmount(transaction.amount)})</span></div>`;
                });
                
                html += '</div>';
            }

            html += '</div>';
        }

        // Add combined category balances section
        html += '<div class="ynab-section">';
        html += '<div class="ynab-section-title">Category Balances</div>';
        
        const formatAmount = (amount) => {
            return this.config.showCurrency ? 
                `$${amount.toFixed(2)}` : 
                amount.toFixed(2);
        };

        // Add individual category balances first
        const sortedItems = this.result.items.sort((a, b) => a.name.localeCompare(b.name));
        const itemsHtml = sortedItems.map(item => {
            const balance = item.balance / 1000;
            const formattedBalance = this.config.showCurrency ? 
                `$${balance.toFixed(2)}` : 
                balance.toFixed(2);
            
            const balanceClass = balance < 0 ? 'ynab-balance negative' : 'ynab-balance';
            
            return `<div class="ynab-row"><span class="ynab-name">${item.name}</span><span class="${balanceClass}">${formattedBalance}</span></div>`;
        }).join('');

        html += itemsHtml;

        // Add group summaries at the bottom (if enabled)
        if (this.result.groupSummaries && this.result.groupSummaries.length > 0 && this.config.showGroupSummaries) {
            this.result.groupSummaries.forEach(group => {
                html += `<div class="ynab-row ynab-group"><span class="ynab-name">${group.name}</span><span class="ynab-balance">${formatAmount(group.totalAvailable)}</span></div>`;
            });
        }

        html += '</div>';

        // Add subtle loading indicator if currently loading
        if (this.loading) {
            html += '<div class="ynab-loading-subtle">Updating...</div>';
        }

        wrapper.innerHTML = html;
        return wrapper;
    },

    socketNotificationReceived: function (notification, payload) {
        console.log("MMM-YNAB notification:", notification);
        
        switch (notification) {
            case "YNAB_UPDATE":
                this.result = payload;
                this.loading = false;
                this.error = null;
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

    getStyles: function() {
        return [
            this.file('MMM-YNAB.css')
        ];
    }
});
