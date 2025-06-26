import { useState, useEffect, useContext } from 'react';
import { AuthContext } from './AuthProvider';
import { createEmailNotification } from '../utils/emailService';

function StatusBadge({ status }) {
  const statusStyles = {
    pending: 'status-pending',
    resolved: 'status-resolved',
    escalated: 'status-escalated',
    terminated: 'status-terminated'
  };
  
  return (
    <span className={`status-badge ${statusStyles[status] || 'bg-gray-100'}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

function AdminDashboard() {
  const { session, supabase } = useContext(AuthContext);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [profile, setProfile] = useState(null);
  const [requests, setRequests] = useState([]);
  const [filteredRequests, setFilteredRequests] = useState([]);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [responseText, setResponseText] = useState('');
  const [responseFile, setResponseFile] = useState(null);
  const [submittingResponse, setSubmittingResponse] = useState(false);
  const [tab, setTab] = useState('pending');
  const [filePreview, setFilePreview] = useState(null);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (!session?.user) return;
    
    const fetchAdminProfile = async () => {
      try {
        console.log('Fetching admin profile...');
        const { data, error } = await supabase
          .from('profiles')
          .select('*, departments:department_id(*)')
          .eq('id', session.user.id)
          .single();
          
        if (error) {
          console.error('Error fetching admin profile:', error);
          throw error;
        }
        
        console.log('Admin profile loaded:', data);
        setProfile(data);
        
        // Check if user is admin
        if (data.role !== 'admin' && data.role !== 'super_admin') {
          setError('Access denied. You do not have administrator privileges.');
          setLoading(false);
          return;
        }
        
        // Fetch requests after profile is loaded
        await fetchRequests(data);
      } catch (err) {
        console.error('Error in fetchAdminProfile:', err);
        setError('Failed to load your profile information: ' + (err.message || 'Unknown error'));
        setLoading(false);
      }
    };
    
    fetchAdminProfile();
  }, [session, supabase]);
  
  useEffect(() => {
    // Create preview URL for file if selected
    if (responseFile) {
      const fileType = responseFile.type.split('/')[0];
      if (fileType === 'image') {
        const objectUrl = URL.createObjectURL(responseFile);
        setFilePreview(objectUrl);
        
        return () => URL.revokeObjectURL(objectUrl);
      } else {
        setFilePreview(null);
      }
    }
  }, [responseFile]);

  // Filter requests when search term changes
  useEffect(() => {
    if (searchTerm.trim() === '') {
      setFilteredRequests(requests);
      return;
    }
    
    const term = searchTerm.toLowerCase().trim();
    const filtered = requests.filter(request => 
      request.id.toLowerCase().includes(term)
    );
    
    setFilteredRequests(filtered);
  }, [searchTerm, requests]);
  
  const fetchRequests = async (adminProfile) => {
    if (!adminProfile) {
      console.error('Cannot fetch requests: adminProfile is null');
      return;
    }
    
    try {
      setLoadingRequests(true);
      console.log('Fetching requests for role:', adminProfile.role);
      
      // Department-specific query for regular admins
      let query = supabase
        .from('examination_requests')
        .select(`
          *,
          departments:department_id(*),
          student:student_id(full_name, email, student_id, phone)
        `)
        .order('created_at', { ascending: false });
      
      // Filter requests by department for regular admins
      if (adminProfile.role === 'admin') {
        console.log('Filtering by department:', adminProfile.department_id);
        query = query.eq('department_id', adminProfile.department_id);
      }
      
      // For super_admin, only show escalated requests
      if (adminProfile.role === 'super_admin') {
        console.log('Super admin: showing escalated requests');
        query = query.eq('status', 'escalated');
      }
      
      // Apply tab filters
      if (tab === 'pending') {
        query = query.eq('status', 'pending');
      } else if (tab === 'resolved') {
        query = query.eq('status', 'resolved');
      } else if (tab === 'escalated' && adminProfile.role !== 'super_admin') {
        query = query.eq('status', 'escalated');
      } else if (tab === 'terminated') {
        query = query.eq('status', 'terminated');
      }
      
      console.log('Executing request query...');
      const { data, error } = await query;
      
      if (error) {
        console.error('Error in request query:', error);
        throw error;
      }
      
      console.log('Requests loaded:', data?.length || 0);
      setRequests(data || []);
      setFilteredRequests(data || []);
    } catch (err) {
      console.error('Error fetching requests:', err);
      setError('Failed to load requests: ' + (err.message || 'Unknown error'));
    } finally {
      setLoadingRequests(false);
      setLoading(false);
    }
  };
  
  const handleViewDetails = (request) => {
    setSelectedRequest(request);
    setResponseText('');
    setResponseFile(null);
    setFilePreview(null);
  };
  
  const handleResolve = async () => {
    if (!selectedRequest || !responseText.trim()) {
      return;
    }
    
    try {
      setSubmittingResponse(true);
      
      // Upload response attachment if provided
      let attachmentUrl = null;
      if (responseFile) {
        const fileExt = responseFile.name.split('.').pop();
        const allowedTypes = ['pdf', 'jpg', 'jpeg', 'png', 'gif', 'xls', 'xlsx'];
        
        if (!allowedTypes.includes(fileExt.toLowerCase())) {
          throw new Error('File type not supported. Please upload PDF, Image, or Excel files only.');
        }
        
        const fileName = `response_${session.user.id}_${Date.now()}.${fileExt}`;
        
        console.log('Uploading response file:', fileName);
        const { error: uploadError } = await supabase.storage
          .from('request-responses')
          .upload(fileName, responseFile);

        if (uploadError) {
          console.error('File upload error:', uploadError);
          throw uploadError;
        }

        const { data: { publicUrl } } = supabase.storage
          .from('request-responses')
          .getPublicUrl(fileName);

        attachmentUrl = publicUrl;
        console.log('File uploaded, URL:', attachmentUrl);
      }
      
      // Create response record
      console.log('Creating response record...');
      const { error: responseError } = await supabase
        .from('request_responses')
        .insert({
          request_id: selectedRequest.id,
          responder_id: session.user.id,
          response_text: responseText,
          response_type: 'resolution',
          attachments: attachmentUrl ? [attachmentUrl] : []
        });
        
      if (responseError) {
        console.error('Response record error:', responseError);
        throw responseError;
      }
      
      // Update request status to resolved
      console.log('Updating request status...');
      const { error: updateError } = await supabase
        .from('examination_requests')
        .update({
          status: 'resolved',
          resolved_at: new Date().toISOString(),
          resolution_notes: responseText,
          assigned_admin_id: session.user.id
        })
        .eq('id', selectedRequest.id);
        
      if (updateError) {
        console.error('Request update error:', updateError);
        throw updateError;
      }
      
      // Create and send email notification
      console.log('Creating email notification...');
      await createEmailNotification(supabase, {
        recipientEmail: selectedRequest.student.email,
        recipientName: selectedRequest.student.full_name,
        requestId: selectedRequest.id,
        emailType: 'request_resolved',
        subject: `Your Request "${selectedRequest.title}" Has Been Resolved`,
        content: `Dear ${selectedRequest.student.full_name},

Your request "${selectedRequest.title}" has been resolved. Here's the resolution:

${responseText}

Thank you for your patience.

Regards,
SRMIST Examination Control Team`,
        attachments: attachmentUrl ? [attachmentUrl] : []
      });
      
      // Close details modal and refresh
      setSelectedRequest(null);
      if (profile) {
        fetchRequests(profile);
      }
    } catch (err) {
      console.error('Error resolving request:', err);
      alert('Failed to resolve request: ' + (err.message || 'Unknown error'));
    } finally {
      setSubmittingResponse(false);
    }
  };
  
  const handleEscalate = async () => {
    if (!selectedRequest || !responseText.trim()) {
      return;
    }
    
    try {
      setSubmittingResponse(true);
      
      // Upload response attachment if provided
      let attachmentUrl = null;
      if (responseFile) {
        const fileExt = responseFile.name.split('.').pop();
        const allowedTypes = ['pdf', 'jpg', 'jpeg', 'png', 'gif', 'xls', 'xlsx'];
        
        if (!allowedTypes.includes(fileExt.toLowerCase())) {
          throw new Error('File type not supported. Please upload PDF, Image, or Excel files only.');
        }
        
        const fileName = `response_${session.user.id}_${Date.now()}.${fileExt}`;
        
        const { error: uploadError } = await supabase.storage
          .from('request-responses')
          .upload(fileName, responseFile);

        if (uploadError) {
          throw uploadError;
        }

        const { data: { publicUrl } } = supabase.storage
          .from('request-responses')
          .getPublicUrl(fileName);

        attachmentUrl = publicUrl;
      }
      
      // Create response record for escalation
      const { error: responseError } = await supabase
        .from('request_responses')
        .insert({
          request_id: selectedRequest.id,
          responder_id: session.user.id,
          response_text: responseText,
          response_type: 'escalation',
          attachments: attachmentUrl ? [attachmentUrl] : []
        });
        
      if (responseError) {
        throw responseError;
      }
      
      // Update request status to escalated
      const { error: updateError } = await supabase
        .from('examination_requests')
        .update({
          status: 'escalated',
          assigned_admin_id: session.user.id
        })
        .eq('id', selectedRequest.id);
        
      if (updateError) {
        throw updateError;
      }
      
      // Create and send email notification
      await createEmailNotification(supabase, {
        recipientEmail: selectedRequest.student.email,
        recipientName: selectedRequest.student.full_name,
        requestId: selectedRequest.id,
        emailType: 'request_escalated',
        subject: `Your Request "${selectedRequest.title}" Has Been Escalated`,
        content: `Dear ${selectedRequest.student.full_name},

Your request "${selectedRequest.title}" has been escalated to senior administrators for further review.

${responseText}

Thank you for your patience.

Regards,
SRMIST Examination Control Team`,
        attachments: attachmentUrl ? [attachmentUrl] : []
      });
      
      // Close details modal and refresh
      setSelectedRequest(null);
      if (profile) {
        fetchRequests(profile);
      }
    } catch (err) {
      console.error('Error escalating request:', err);
      alert('Failed to escalate request: ' + (err.message || 'Unknown error'));
    } finally {
      setSubmittingResponse(false);
    }
  };
  
  const handleTerminate = async () => {
    if (!selectedRequest || !responseText.trim()) {
      return;
    }
    
    try {
      setSubmittingResponse(true);
      
      // Upload response attachment if provided
      let attachmentUrl = null;
      if (responseFile) {
        const fileExt = responseFile.name.split('.').pop();
        const allowedTypes = ['pdf', 'jpg', 'jpeg', 'png', 'gif', 'xls', 'xlsx'];
        
        if (!allowedTypes.includes(fileExt.toLowerCase())) {
          throw new Error('File type not supported. Please upload PDF, Image, or Excel files only.');
        }
        
        const fileName = `response_${session.user.id}_${Date.now()}.${fileExt}`;
        
        const { error: uploadError } = await supabase.storage
          .from('request-responses')
          .upload(fileName, responseFile);

        if (uploadError) {
          throw uploadError;
        }

        const { data: { publicUrl } } = supabase.storage
          .from('request-responses')
          .getPublicUrl(fileName);

        attachmentUrl = publicUrl;
      }
      
      // Create response record for termination
      const { error: responseError } = await supabase
        .from('request_responses')
        .insert({
          request_id: selectedRequest.id,
          responder_id: session.user.id,
          response_text: responseText,
          response_type: 'termination',
          attachments: attachmentUrl ? [attachmentUrl] : []
        });
        
      if (responseError) {
        throw responseError;
      }
      
      // Update request status to terminated
      const { error: updateError } = await supabase
        .from('examination_requests')
        .update({
          status: 'terminated',
          resolved_at: new Date().toISOString(),
          resolution_notes: responseText,
          assigned_admin_id: session.user.id
        })
        .eq('id', selectedRequest.id);
        
      if (updateError) {
        throw updateError;
      }
      
      // Create and send email notification
      await createEmailNotification(supabase, {
        recipientEmail: selectedRequest.student.email,
        recipientName: selectedRequest.student.full_name,
        requestId: selectedRequest.id,
        emailType: 'request_terminated',
        subject: `Your Request "${selectedRequest.title}" Has Been Closed`,
        content: `Dear ${selectedRequest.student.full_name},

Your request "${selectedRequest.title}" has been closed. Here's the reason:

${responseText}

Thank you for your understanding.

Regards,
SRMIST Examination Control Team`,
        attachments: attachmentUrl ? [attachmentUrl] : []
      });
      
      // Close details modal and refresh
      setSelectedRequest(null);
      if (profile) {
        fetchRequests(profile);
      }
    } catch (err) {
      console.error('Error terminating request:', err);
      alert('Failed to terminate request: ' + (err.message || 'Unknown error'));
    } finally {
      setSubmittingResponse(false);
    }
  };
  
  const changeTab = (newTab) => {
    setTab(newTab);
    setSearchTerm(''); // Clear search when changing tab
    if (profile) {
      fetchRequests(profile);
    }
  };

  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value);
  };

  if (loading && !profile) {
    return (
      <div className="page-container flex justify-center items-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-10 w-10 border-4 border-blue-600 border-opacity-50 border-t-blue-600"></div>
          <p className="mt-4 text-gray-600 font-medium">Loading admin dashboard...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page-container flex justify-center items-center">
        <div className="glass-card p-8 w-full max-w-md">
          <div className="text-center mb-6">
            <svg className="w-16 h-16 text-red-500 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
            <h2 className="text-2xl font-bold text-gray-800">Access Error</h2>
            <p className="mt-2 text-red-600">{error}</p>
          </div>
          <button
            onClick={() => window.location.href = '/'}
            className="secondary-button w-full"
          >
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container">
      <div className="dashboard-container fade-in">
        <div className="card-header">
          <div>
            <h1 className="text-2xl font-bold text-gray-800 mb-1">
              {profile?.role === 'super_admin' ? 'SuperAdmin Dashboard' : 'Admin Dashboard'}
            </h1>
            <div className="text-gray-600">
              {profile?.role === 'super_admin' 
                ? 'Manage escalated requests across all departments' 
                : `Managing ${profile?.departments?.name || 'Department'} requests`}
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
        
        <div className="border-b border-gray-200 mb-6">
          <nav className="flex space-x-4 overflow-x-auto" aria-label="Tabs">
            <button 
              onClick={() => changeTab('pending')}
              className={`px-4 py-2 font-medium text-sm rounded-t-lg ${
                tab === 'pending' ? 'border-b-2 border-blue-600 text-blue-600 font-semibold' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Pending
            </button>
            <button 
              onClick={() => changeTab('resolved')}
              className={`px-4 py-2 font-medium text-sm rounded-t-lg ${
                tab === 'resolved' ? 'border-b-2 border-blue-600 text-blue-600 font-semibold' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Resolved
            </button>
            {profile?.role !== 'super_admin' && (
              <button 
                onClick={() => changeTab('escalated')}
                className={`px-4 py-2 font-medium text-sm rounded-t-lg ${
                  tab === 'escalated' ? 'border-b-2 border-blue-600 text-blue-600 font-semibold' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Escalated
              </button>
            )}
            <button 
              onClick={() => changeTab('terminated')}
              className={`px-4 py-2 font-medium text-sm rounded-t-lg ${
                tab === 'terminated' ? 'border-b-2 border-blue-600 text-blue-600 font-semibold' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Terminated
            </button>
          </nav>
        </div>
        
        {/* Search input */}
        <div className="mb-6">
          <div className="relative">
            <input
              type="text"
              value={searchTerm}
              onChange={handleSearchChange}
              placeholder="Search by Request ID..."
              className="form-input pl-10 w-full md:w-64"
            />
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <svg className="h-5 w-5 text-gray-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
              </svg>
            </div>
          </div>
        </div>
        
        {loadingRequests ? (
          <div className="text-center py-10">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-blue-600 border-opacity-50 border-t-blue-600"></div>
            <p className="mt-4 text-gray-500">Loading requests...</p>
          </div>
        ) : filteredRequests.length === 0 ? (
          <div className="glass-card p-8 text-center">
            <svg className="w-16 h-16 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
            </svg>
            {searchTerm ? (
              <p className="text-gray-500">No requests found matching ID: "{searchTerm}"</p>
            ) : (
              <p className="text-gray-500">No {tab} requests found.</p>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto bg-white rounded-lg shadow">
            <table className="data-table">
              <thead>
                <tr>
                  <th className="data-table-header">Request ID</th>
                  <th className="data-table-header">Title</th>
                  <th className="data-table-header">Student</th>
                  <th className="data-table-header">Department</th>
                  <th className="data-table-header">Date</th>
                  <th className="data-table-header">Status</th>
                  <th className="data-table-header">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredRequests.map((request) => (
                  <tr key={request.id} className="hover:bg-gray-50 transition-colors duration-200">
                    <td className="data-table-cell">
                      <span className="font-mono text-xs bg-gray-100 px-2 py-1 rounded">
                        {request.id}
                      </span>
                    </td>
                    <td className="data-table-cell">
                      <div className="text-sm font-medium text-gray-900">{request.title}</div>
                      <div className="text-xs text-gray-500">{request.request_type.replace('_', ' ')}</div>
                    </td>
                    <td className="data-table-cell">
                      <div className="text-sm">{request.student?.full_name}</div>
                      <div className="text-xs text-gray-500">{request.student?.student_id}</div>
                    </td>
                    <td className="data-table-cell">
                      <div className="text-sm">{request.departments?.name || 'Unknown'}</div>
                    </td>
                    <td className="data-table-cell">
                      <div className="text-sm text-gray-500">
                        {new Date(request.created_at).toLocaleDateString()}
                      </div>
                    </td>
                    <td className="data-table-cell">
                      <StatusBadge status={request.status} />
                    </td>
                    <td className="data-table-cell">
                      <button
                        onClick={() => handleViewDetails(request)}
                        className="primary-button text-sm py-1 px-3"
                      >
                        View & Respond
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      
      {selectedRequest && (
        <div className="modal-overlay">
          <div className="modal-container">
            <div className="flex justify-between items-center border-b border-gray-200 pb-4 mb-6">
              <h3 className="text-xl font-bold text-gray-800">Request Details</h3>
              <button
                onClick={() => setSelectedRequest(null)}
                className="text-gray-500 hover:text-gray-700 focus:outline-none"
                aria-label="Close"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                </svg>
              </button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <div className="glass-card p-4">
                <h4 className="text-sm font-medium text-gray-500 mb-2">Request Information</h4>
                <div className="space-y-3">
                  <div>
                    <span className="block text-xs text-gray-500">Request ID</span>
                    <span className="block font-mono text-sm bg-gray-100 px-2 py-1 rounded mt-1">{selectedRequest.id}</span>
                  </div>
                  
                  <div>
                    <span className="block text-xs text-gray-500">Status</span>
                    <StatusBadge status={selectedRequest.status} />
                  </div>
                  
                  <div>
                    <span className="block text-xs text-gray-500">Type</span>
                    <span className="capitalize text-sm">{selectedRequest.request_type.replace('_', ' ')}</span>
                  </div>
                  
                  <div>
                    <span className="block text-xs text-gray-500">Priority</span>
                    <span className="capitalize text-sm">{selectedRequest.priority}</span>
                  </div>
                  
                  <div>
                    <span className="block text-xs text-gray-500">Submitted On</span>
                    <span className="text-sm">{new Date(selectedRequest.created_at).toLocaleString()}</span>
                  </div>
                </div>
              </div>
              
              <div className="glass-card p-4">
                <h4 className="text-sm font-medium text-gray-500 mb-2">Student Information</h4>
                <div className="space-y-3">
                  <div>
                    <span className="block text-xs text-gray-500">Name</span>
                    <span className="block text-sm font-medium">{selectedRequest.student?.full_name}</span>
                  </div>
                  
                  <div>
                    <span className="block text-xs text-gray-500">Email</span>
                    <span className="block text-sm">{selectedRequest.student?.email}</span>
                  </div>
                  
                  <div>
                    <span className="block text-xs text-gray-500">Student ID</span>
                    <span className="block text-sm">{selectedRequest.student?.student_id}</span>
                  </div>
                  
                  <div>
                    <span className="block text-xs text-gray-500">Phone</span>
                    <span className="block text-sm">{selectedRequest.student?.phone || 'Not provided'}</span>
                  </div>
                  
                  <div>
                    <span className="block text-xs text-gray-500">Department</span>
                    <span className="block text-sm">{selectedRequest.departments?.name || 'Unknown'}</span>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="glass-card p-5 mb-6">
              <h4 className="text-lg font-medium text-gray-800 mb-2">{selectedRequest.title}</h4>
              <p className="bg-gray-50 p-4 rounded text-gray-700 mb-4">{selectedRequest.description}</p>
              
              {selectedRequest.attachments && selectedRequest.attachments.length > 0 && (
                <div>
                  <h5 className="text-sm font-medium text-gray-700 mb-2">Attachments</h5>
                  <div className="flex flex-wrap gap-2">
                    {selectedRequest.attachments.map((url, index) => (
                      <a
                        key={index}
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 bg-blue-50 text-blue-700 px-3 py-2 rounded-lg hover:bg-blue-100 transition-colors border border-blue-200"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"></path>
                        </svg>
                        Attachment {index + 1}
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
            
            {selectedRequest.status === 'pending' && (
              <div className="glass-card p-5">
                <h4 className="text-lg font-medium mb-4">Respond to Request</h4>
                
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Your Response</label>
                  <textarea
                    value={responseText}
                    onChange={(e) => setResponseText(e.target.value)}
                    className="form-input min-h-[120px]"
                    placeholder="Type your response to the student here..."
                    rows="4"
                    required
                  ></textarea>
                </div>
                
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Attachment (Optional)
                  </label>
                  <div className="border border-dashed border-gray-300 rounded-lg p-4 bg-gray-50">
                    <input
                      type="file"
                      onChange={(e) => setResponseFile(e.target.files[0])}
                      className="w-full"
                      accept=".pdf,.jpg,.jpeg,.png,.gif,.xls,.xlsx"
                    />
                    <p className="mt-1 text-xs text-gray-500">
                      Accepted formats: PDF, Images (JPG, PNG, GIF), Excel (XLS, XLSX)
                    </p>
                  </div>
                  
                  {filePreview && (
                    <div className="mt-2 p-3 border rounded-lg bg-gray-50">
                      <div className="font-medium text-sm text-gray-700 mb-1">Preview</div>
                      <img src={filePreview} alt="File preview" className="max-h-48 rounded border" />
                    </div>
                  )}
                  
                  {responseFile && !filePreview && (
                    <div className="mt-2 flex items-center gap-2 p-3 border rounded-lg bg-gray-50">
                      <svg className="w-6 h-6 text-gray-500" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
                        <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
                      </svg>
                      <span className="text-gray-700 text-sm">{responseFile.name}</span>
                    </div>
                  )}
                </div>
                
                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={handleResolve}
                    disabled={submittingResponse || !responseText.trim()}
                    className="success-button flex items-center gap-2"
                  >
                    {submittingResponse ? (
                      <>
                        <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Processing...
                      </>
                    ) : (
                      <>
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
                        </svg>
                        Resolve Request
                      </>
                    )}
                  </button>
                  
                  {profile?.role === 'admin' && (
                    <button
                      onClick={handleEscalate}
                      disabled={submittingResponse || !responseText.trim()}
                      className="primary-button flex items-center gap-2"
                    >
                      {submittingResponse ? 'Processing...' : (
                        <>
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 5l7 7-7 7M5 5l7 7-7 7"></path>
                          </svg>
                          Escalate to SuperAdmin
                        </>
                      )}
                    </button>
                  )}
                  
                  <button
                    onClick={handleTerminate}
                    disabled={submittingResponse || !responseText.trim()}
                    className="danger-button flex items-center gap-2"
                  >
                    {submittingResponse ? 'Processing...' : (
                      <>
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                        </svg>
                        Terminate Request
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminDashboard; 