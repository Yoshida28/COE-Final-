import { useContext, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from './AuthProvider';
import RequestForm from './RequestForm';
import RequestHistory from './RequestHistory';
import AdminDashboard from './AdminDashboard';
import ProfileSetup from './ProfileSetup';
import { processEmailQueue } from '../utils/emailService';

function Home() {
  const { session, supabase, authError } = useContext(AuthContext);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  // Function to ensure storage buckets exist
  const ensureStorageBuckets = async () => {
    try {
      console.log('Checking storage buckets...');
      
      // Check if request-attachments bucket exists
      const { data: buckets, error: listError } = await supabase.storage.listBuckets();
      
      if (listError) {
        console.error('Error listing buckets:', listError);
        return;
      }
      
      const existingBuckets = buckets.map(bucket => bucket.name);
      console.log('Existing buckets:', existingBuckets);
      
      // Create request-attachments bucket if it doesn't exist
      if (!existingBuckets.includes('request-attachments')) {
        console.log('Creating request-attachments bucket...');
        const { error } = await supabase.storage.createBucket('request-attachments', {
          public: true,
          fileSizeLimit: 10485760, // 10MB
          allowedMimeTypes: ['image/png', 'image/jpeg', 'image/gif', 'application/pdf', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
        });
        
        if (error) {
          console.error('Error creating request-attachments bucket:', error);
        } else {
          console.log('request-attachments bucket created successfully');
        }
      }
      
      // Create request-responses bucket if it doesn't exist
      if (!existingBuckets.includes('request-responses')) {
        console.log('Creating request-responses bucket...');
        const { error } = await supabase.storage.createBucket('request-responses', {
          public: true,
          fileSizeLimit: 10485760, // 10MB
          allowedMimeTypes: ['image/png', 'image/jpeg', 'image/gif', 'application/pdf', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
        });
        
        if (error) {
          console.error('Error creating request-responses bucket:', error);
        } else {
          console.log('request-responses bucket created successfully');
        }
      }
    } catch (err) {
      console.error('Error ensuring storage buckets:', err);
    }
  };

  useEffect(() => {
    if (!session) {
      navigate('/login');
      return;
    }

    const fetchUserProfile = async () => {
      try {
        setLoading(true);
        
        // First ensure storage buckets exist
        await ensureStorageBuckets();
        
        const { data, error } = await supabase
          .from('profiles')
          .select('*, departments:department_id(*)')
          .eq('id', session.user.id)
          .single();

        if (error) {
          if (error.code === 'PGRST116') {
            // Profile not found, should show ProfileSetup
            console.log('Profile not found, need setup');
            setProfile(null);
          } else {
            console.error('Error fetching profile:', error);
            setError(`Failed to load profile: ${error.message}`);
          }
        } else {
          setProfile(data);
          
          // Process email queue when admin logs in
          if (data.role === 'admin' || data.role === 'super_admin') {
            console.log('Admin user detected, processing email queue');
            processEmailQueue(supabase).catch(err => 
              console.error('Failed to process email queue:', err)
            );
          }
        }
      } catch (err) {
        console.error('Unexpected error:', err);
        setError('An unexpected error occurred');
      } finally {
        setLoading(false);
      }
    };

    fetchUserProfile();
  }, [session, supabase, navigate]);

  const refreshRequests = () => {
    // This function is passed to RequestForm to refresh RequestHistory after submission
    // The component will re-render which will reload the requests
  };

  if (loading) {
    return (
      <div className="page-container flex justify-center items-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-10 w-10 border-4 border-blue-600 border-opacity-50 border-t-blue-600"></div>
          <p className="mt-4 text-gray-600 font-medium">Loading your dashboard...</p>
        </div>
      </div>
    );
  }

  if (error || authError) {
    return (
      <div className="page-container flex justify-center items-center">
        <div className="glass-card p-8 w-full max-w-md">
          <div className="text-center mb-6">
            <svg className="w-16 h-16 text-red-500 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
            <h2 className="text-2xl font-bold text-gray-800">Error</h2>
            <p className="mt-2 text-red-600">{error || authError}</p>
          </div>
          <button
            onClick={() => supabase.auth.signOut()}
            className="secondary-button w-full"
          >
            Sign Out and Try Again
          </button>
        </div>
      </div>
    );
  }

  // If profile doesn't exist, show setup form
  if (!profile) {
    return <ProfileSetup />;
  }

  // For admin or superadmin, show admin dashboard
  if (profile.role === 'admin' || profile.role === 'super_admin') {
    console.log('Rendering AdminDashboard for role:', profile.role);
    return <AdminDashboard />;
  }

  // Get time of day for greeting
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  // For students, show request form and history
  return (
    <div className="page-container">
      <div className="dashboard-container fade-in">
        <div className="card-header">
          <div>
            <h1 className="text-2xl font-bold text-gray-800 mb-1">Student Dashboard</h1>
            <div className="flex flex-wrap items-center gap-2 text-gray-600">
              <span className="font-medium">{getGreeting()}, {profile.full_name.split(' ')[0]}</span>
              <span>•</span>
              <span>ID: {profile.student_id}</span>
              <span>•</span>
              <span>{profile.departments?.name || 'Department not set'}</span>
            </div>
          </div>
          <div className="mt-4 md:mt-0">
            <button
              onClick={() => supabase.auth.signOut()}
              className="danger-button flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path>
              </svg>
              Sign Out
            </button>
          </div>
        </div>
        
        <div className="mb-8 bg-blue-50 border-l-4 border-blue-500 p-4 rounded-md shadow-sm">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-blue-500" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm text-blue-700">
                Welcome to the SRMIST Examination Control Portal. Here you can submit and track your examination-related requests.
              </p>
            </div>
          </div>
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 order-2 lg:order-1">
            <RequestHistory />
          </div>
          
          <div className="lg:col-span-1 order-1 lg:order-2">
            <div className="glass-card p-6 card-hover">
              <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center">
                <svg className="w-5 h-5 mr-2 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path>
                </svg>
                Submit New Request
              </h2>
              <RequestForm onRequestSubmitted={refreshRequests} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Home;