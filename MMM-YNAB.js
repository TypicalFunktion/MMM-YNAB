Module.register("MMM-YNAB", {
    result: [],
    loading: true,
    error: null,
    defaults: {
        token: "",
        categories: ["Household", "Pets", "Grocery", "Lunch", "Kids Clothes", "Restaurants", "Spontaneous Fun"],
        updateInterval: 90000, // 90 seconds, now configurable
        showCurrency: true,
        currencyFormat: "USD"
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

        if (this.loading) {
            wrapper.innerHTML = '<div class="ynab-loading">Loading YNAB...</div>';
            return wrapper;
        }

        if (!this.result.items || this.result.items.length === 0) {
            wrapper.innerHTML = '<div class="ynab-no-data">No category data available</div>';
            return wrapper;
        }

        const itemsHtml = this.result.items.map(item => {
            const balance = item.balance / 1000;
            const formattedBalance = this.config.showCurrency ? 
                `$${balance.toFixed(2)}` : 
                balance.toFixed(2);
            
            const balanceClass = balance < 0 ? 'ynab-balance negative' : 'ynab-balance';
            
            return `<span class="ynab-name">${item.name}</span><span class="${balanceClass}">${formattedBalance}</span>`;
        }).join('');

        wrapper.innerHTML = itemsHtml;
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
