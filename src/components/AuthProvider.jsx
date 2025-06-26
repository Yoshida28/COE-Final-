import { createContext, useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

export const AuthContext = createContext();

// Create Supabase client
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Validate environment variables
if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase environment variables. Please check your .env file.');
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Allowed email domains
const ALLOWED_DOMAINS = ['@srmist.edu.in', '@srmist.in'];

function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(null);

  // Check if email domain is allowed
  const isAllowedEmail = (email) => {
    if (!email) return false;
    return ALLOWED_DOMAINS.some(domain => 
      email.toLowerCase().endsWith(domain)
    );
  };

  // Handle user session
  const handleSession = async (currentSession) => {
    if (!currentSession) {
      setSession(null);
      return;
    }
    
    if (isAllowedEmail(currentSession?.user?.email)) {
      setSession(currentSession);
      setAuthError(null);
    } else {
      console.log('User email not from allowed domain, signing out');
      await supabase.auth.signOut();
      setSession(null);
      setAuthError('Please use an SRM email (@srmist.edu.in or @srmist.in)');
    }
  };

  useEffect(() => {
    // Initial session check
    const fetchSession = async () => {
      try {
        setLoading(true);
        const { data, error } = await supabase.auth.getSession();
        
        if (error) {
          console.error('Error getting session:', error);
          setAuthError(error.message);
          setSession(null);
        } else {
          await handleSession(data.session);
        }
      } catch (err) {
        console.error('Unexpected error in fetchSession:', err);
        setAuthError('Failed to initialize session');
        setSession(null);
      } finally {
        setLoading(false);
      }
    };

    fetchSession();

    // Auth state change listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, newSession) => {
        console.log('Auth state changed:', event);
        
        try {
          setLoading(true);
          
          switch (event) {
            case 'SIGNED_IN':
            case 'TOKEN_REFRESHED':
              await handleSession(newSession);
              break;
            case 'SIGNED_OUT':
              setSession(null);
              setAuthError(null);
              break;
            case 'USER_UPDATED':
              setSession(newSession);
              break;
            default:
              // Handle other events if needed
              break;
          }
        } catch (err) {
          console.error('Error in auth state change:', err);
          setAuthError('Error processing authentication');
        } finally {
          setLoading(false);
        }
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // Force loading to false after a timeout to prevent infinite loading
  useEffect(() => {
    const timer = setTimeout(() => {
      if (loading) {
        console.log('Force ending loading state after timeout');
        setLoading(false);
      }
    }, 3000); // Reduced from 5000ms to 3000ms for better UX
    
    return () => clearTimeout(timer);
  }, [loading]);

  return (
    <AuthContext.Provider value={{ session, supabase, authError, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export default AuthProvider;