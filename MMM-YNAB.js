Module.register("MMM-YNAB", {
    result: [],
    loading: true,
    error: null,
    currentTransactionIndex: 0, // Track which set of transactions to show
    defaults: {
        token: "",
        budgetId: null, // Optional: specific budget ID to use
        categories: ["Household", "Pets", "Grocery", "Lunch", "Kids Clothes", "Restaurants", "Spontaneous Fun"],
        groups: [], // Optional: specific category groups to display (e.g., ["Monthly Bills", "True Expenses"])
        excludedCategories: ["Rent"], // Categories to exclude from spending calculations
        excludedGroups: ["Monthly Bills", "Bills", "Fixed Expenses"], // Category groups to exclude from spending calculations
        showUncleared: true, // Include uncleared transactions (optional, default: true)
        updateInterval: 90000, // 90 seconds, now configurable
        showCurrency: true,
        currencyFormat: "USD",
        showGroupSummaries: true // Show category group totals (optional)
    },

    start: function () {
        this.loading = true;
        this.error = null;
        this.currentTransactionIndex = 0;
        this.sendSocketNotification('YNAB_SET_CONFIG', this.config);
        
        // Start transaction rotation timer
        this.startTransactionRotation();
    },

    stop: function () {
        // Clean up when module is stopped
        this.sendSocketNotification('YNAB_CLEANUP');
        this.stopTransactionRotation();
    },

    startTransactionRotation: function () {
        this.rotationTimer = setInterval(() => {
            this.rotateTransactions();
        }, 15000); // 15 seconds
    },

    stopTransactionRotation: function () {
        if (this.rotationTimer) {
            clearInterval(this.rotationTimer);
            this.rotationTimer = null;
        }
    },

    rotateTransactions: function () {
        if (this.result.lastTransactions && this.result.lastTransactions.length > 0) {
            const maxIndex = this.result.lastTransactions.length - 3; // Maximum index to show
            
            // Increment the index
            this.currentTransactionIndex = this.currentTransactionIndex + 1;
            
            // If we've reached the end, smoothly transition back to the beginning
            if (this.currentTransactionIndex > maxIndex) {
                this.currentTransactionIndex = 0;
            }
            
            // Find the transactions container and animate the scroll
            const container = document.querySelector('.ynab-transactions-container');
            if (container) {
                const rowHeight = 20; // Height of each transaction row
                const translateY = -(this.currentTransactionIndex * rowHeight);
                container.style.transform = `translateY(${translateY}px)`;
            }
        }
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

            // Add recent transactions as sub-list
            if (this.result.lastTransactions && this.result.lastTransactions.length > 0) {
                html += '<div class="ynab-subsection">';
                html += '<div class="ynab-subsection-title">Recent 10</div>';
                
                // Create a fixed wrapper container
                html += '<div class="ynab-transactions-wrapper">';
                
                // Create a container for smooth scrolling animation
                const maxIndex = this.result.lastTransactions.length - 3; // Maximum index to show
                const clampedIndex = Math.min(this.currentTransactionIndex, maxIndex);
                const initialTranslateY = -(clampedIndex * 20); // 20px per row
                html += `<div class="ynab-transactions-container" style="transform: translateY(${initialTranslateY}px);">`;
                
                // Show all 10 transactions in the container (only 3 will be visible due to overflow)
                this.result.lastTransactions.forEach((transaction, index) => {
                    const transactionDate = new Date(transaction.date);
                    const formattedDate = transactionDate.toLocaleDateString('en-US', { 
                        month: 'numeric', 
                        year: '2-digit' 
                    });
                    html += `<div class="ynab-row ynab-sub" data-index="${index}"><span class="ynab-name">${formattedDate} - ${transaction.payee}</span><span class="ynab-balance spending">(${formatAmount(transaction.amount)})</span></div>`;
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
