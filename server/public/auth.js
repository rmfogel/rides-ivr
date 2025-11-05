/**
 * Authentication helper for web interface
 * This script should be included in all protected pages
 */

(function() {
    'use strict';
    
    // Check if user is authenticated
    async function checkAuth() {
        try {
            const response = await fetch('/api/auth/verify-session', {
                method: 'GET',
                credentials: 'same-origin'
            });
            
            if (response.ok) {
                const data = await response.json();
                if (data.authenticated) {
                    return { authenticated: true, phone: data.phone };
                }
            }
            
            return { authenticated: false };
        } catch (error) {
            console.error('Error checking authentication:', error);
            return { authenticated: false };
        }
    }
    
    // Redirect to login if not authenticated
    async function requireAuth() {
        const auth = await checkAuth();
        
        if (!auth.authenticated) {
            // Save current page to return after login
            const currentPage = window.location.pathname + window.location.search;
            sessionStorage.setItem('returnTo', currentPage);
            
            // Redirect to login
            window.location.href = '/login.html';
            return false;
        }
        
        return true;
    }
    
    // Logout function
    async function logout() {
        try {
            await fetch('/api/auth/logout', {
                method: 'POST',
                credentials: 'same-origin'
            });
            
            window.location.href = '/login.html';
        } catch (error) {
            console.error('Logout error:', error);
            // Force redirect anyway
            window.location.href = '/login.html';
        }
    }
    
    // Export functions
    window.Auth = {
        check: checkAuth,
        require: requireAuth,
        logout: logout
    };
    
    // Auto-check authentication on protected pages
    // (pages that are not login.html)
    if (!window.location.pathname.includes('login.html')) {
        // Check auth after a short delay to allow page to load
        setTimeout(() => {
            requireAuth();
        }, 100);
    }
})();
