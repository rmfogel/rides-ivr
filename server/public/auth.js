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
        
        // Auto-fill phone number if there's a phone input field
        if (auth.phone) {
            const phoneInput = document.getElementById('phone');
            if (phoneInput && !phoneInput.value) {
                phoneInput.value = auth.phone;
                // Make it readonly if it's a visible input (not hidden)
                if (phoneInput.type !== 'hidden') {
                    phoneInput.setAttribute('readonly', 'readonly');
                    phoneInput.style.backgroundColor = '#f5f5f5';
                    phoneInput.style.cursor = 'not-allowed';
                }
            }
        }
        
        return auth;
    }
    
    // Get current user info
    async function getCurrentUser() {
        const auth = await checkAuth();
        return auth.authenticated ? { phone: auth.phone } : null;
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
        getCurrentUser: getCurrentUser,
        logout: logout
    };
    
    // Auto-check authentication on protected pages
    // (pages that are not login.html)
    if (!window.location.pathname.includes('login.html')) {
        // Check auth and auto-fill phone after a short delay to allow page to load
        setTimeout(async () => {
            const auth = await requireAuth();
            // Dispatch event so pages can react to user being loaded
            if (auth && auth.phone) {
                window.dispatchEvent(new CustomEvent('userLoaded', { detail: { phone: auth.phone } }));
            }
        }, 100);
    }
})();
