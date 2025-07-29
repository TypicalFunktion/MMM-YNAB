const ynab = require('ynab');
const NodeHelper = require("node_helper");

let ynabBudgetId;
let config;
let self;
let interval;

module.exports = NodeHelper.create({

    socketNotificationReceived: function (notification, payload) {
        switch (notification) {
            case "YNAB_SET_CONFIG":
                this.initialize(payload);
                break;
            case "YNAB_CLEANUP":
                this.cleanup();
                break;
        }
    },

    initialize: function (payload) {
        config = payload;
        self = this;
        
        if (!config.token) {
            this.sendError("YNAB token is required");
            return;
        }

        const ynabAPI = new ynab.API(config.token);

        if (config.budgetId) {
            ynabBudgetId = config.budgetId;
            this.updateBudget();
            this.setInterval();
            return;
        }

        // Get first budget if no specific budget ID provided
        ynabAPI.budgets.getBudgets()
            .then(budgetsResponse => {
                if (!budgetsResponse.data.budgets || budgetsResponse.data.budgets.length === 0) {
                    throw new Error("No budgets found in YNAB account");
                }
                ynabBudgetId = budgetsResponse.data.budgets[0].id;
                this.updateBudget();
                this.setInterval();
            })
            .catch(error => {
                this.handleError(error, "Failed to fetch budgets");
            });
    },

    setInterval: function () {
        if (interval) {
            clearInterval(interval);
        }
        
        const updateInterval = config.updateInterval || 90000;
        interval = setInterval(() => {
            self.updateBudget();
        }, updateInterval);
    },

    updateBudget: function () {
        if (!ynabBudgetId) {
            this.sendError("No budget ID available");
            return;
        }

        self.sendSocketNotification("YNAB_LOADING");
        
        const ynabAPI = new ynab.API(config.token);
        
        ynabAPI.categories.getCategories(ynabBudgetId)
            .then(categoriesResponse => {
                const categoryGroups = categoriesResponse.data.category_groups || [];
                const allCategories = categoryGroups.flatMap(group => group.categories || []);
                
                // Create a map for quick lookup
                const categoryMap = new Map();
                allCategories.forEach(category => {
                    categoryMap.set(category.name, category);
                });

                // Filter categories based on config
                const requestedCategories = config.categories || [];
                const filteredCategories = requestedCategories
                    .map(categoryName => categoryMap.get(categoryName))
                    .filter(category => category !== undefined);

                if (filteredCategories.length === 0) {
                    console.log("MMM-YNAB: No matching categories found. Available categories:", 
                        Array.from(categoryMap.keys()).join(", "));
                }

                self.sendSocketNotification("YNAB_UPDATE", {
                    items: filteredCategories,
                    totalCategories: allCategories.length,
                    matchedCategories: filteredCategories.length
                });
            })
            .catch(error => {
                this.handleError(error, "Failed to fetch categories");
            });
    },

    handleError: function (error, defaultMessage) {
        console.error("MMM-YNAB Error:", error);
        
        let errorMessage = defaultMessage;
        if (error.response && error.response.data && error.response.data.error) {
            errorMessage = error.response.data.error.detail || error.response.data.error.title || defaultMessage;
        } else if (error.message) {
            errorMessage = error.message;
        }

        this.sendError(errorMessage);
    },

    sendError: function (message) {
        self.sendSocketNotification("YNAB_ERROR", {
            message: message,
            timestamp: new Date().toISOString()
        });
    },

    cleanup: function () {
        if (interval) {
            clearInterval(interval);
            interval = null;
        }
        console.log("MMM-YNAB: Cleanup completed");
    }
});
