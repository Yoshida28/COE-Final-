import { useState, useContext, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { AuthContext } from './AuthProvider';

// Request types and priority levels
const REQUEST_TYPES = [
  { value: 'exam_issue', label: 'Exam Issue' },
  { value: 'clarification', label: 'Clarification' },
  { value: 'reschedule', label: 'Reschedule Request' },
  { value: 'grade_dispute', label: 'Grade Dispute' },
  { value: 'other', label: 'Other' }
];

const PRIORITY_LEVELS = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' }
];

function RequestDialog({ onClose, onSubmit }) {
  const { supabase } = useContext(AuthContext);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [file, setFile] = useState(null);
  const [requestType, setRequestType] = useState('');
  const [priority, setPriority] = useState('medium');
  const [departments, setDepartments] = useState([]);
  const [department, setDepartment] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [filePreview, setFilePreview] = useState(null);
  const [requestId, setRequestId] = useState(generateRequestId());
  const [showDialog, setShowDialog] = useState(false);
  
  // Generate a unique request ID
  function generateRequestId() {
    const timestamp = new Date().getTime().toString(36).toUpperCase();
    const randomChars = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `REQ-${timestamp}-${randomChars}`;
  }
  
  useEffect(() => {
    // Animation timing
    setTimeout(() => {
      setShowDialog(true);
    }, 50);
    
    // Fetch departments
    const fetchDepartments = async () => {
      try {
        const { data, error } = await supabase
          .from('departments')
          .select('*')
          .eq('is_active', true);

        if (error) {
          console.error('Error fetching departments:', error);
          return;
        }

        setDepartments(data || []);
      } catch (err) {
        console.error('Error fetching departments:', err);
      }
    };

    fetchDepartments();
  }, [supabase]);
  
  useEffect(() => {
    // Create preview URL for file if selected
    if (file) {
      const fileType = file.type.split('/')[0];
      if (fileType === 'image') {
        const objectUrl = URL.createObjectURL(file);
        setFilePreview(objectUrl);
        
        return () => URL.revokeObjectURL(objectUrl);
      } else {
        setFilePreview(null);
      }
    }
  }, [file]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!title.trim() || !content.trim() || !department || !requestType) {
      setError('Please fill in all required fields');
      return;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      onSubmit({ 
        title, 
        content, 
        file,
        requestType,
        priority,
        department,
        requestId
      });
      
      // Reset form
      setTitle('');
      setContent('');
      setFile(null);
      setFilePreview(null);
      setRequestType('');
      setPriority('medium');
    } catch (err) {
      console.error('Error submitting request:', err);
      setError(err.message || 'Failed to submit request');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setShowDialog(false);
    setTimeout(() => {
      onClose();
    }, 300); // Wait for animation to complete
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div 
        className={`bg-white rounded-xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto transform transition-all duration-300 ${
          showDialog ? 'scale-100 opacity-100' : 'scale-95 opacity-0'
        }`}
      >
        <div className="bg-gradient-to-r from-blue-600 to-blue-800 rounded-t-xl p-5">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-bold text-white">New Examination Request</h2>
            <button
              onClick={handleClose}
              className="text-white hover:text-gray-200 focus:outline-none transition-transform hover:scale-110"
              aria-label="Close"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
              </svg>
            </button>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <span className="text-blue-100 text-sm">Request ID:</span>
            <span className="bg-white bg-opacity-20 text-white px-2 py-1 rounded text-sm font-mono">{requestId}</span>
          </div>
        </div>
        
        <div className="p-6">
          {error && (
            <div className="mb-4 p-3 bg-red-100 text-red-700 rounded-lg border border-red-200 flex items-center gap-2 animate-pulse">
              <svg className="w-5 h-5 shrink-0" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              <span>{error}</span>
            </div>
          )}
          
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Request Title <span className="text-red-500">*</span></label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="form-input"
                placeholder="Brief title describing your request"
                required
              />
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Request Type <span className="text-red-500">*</span></label>
                <select
                  value={requestType}
                  onChange={(e) => setRequestType(e.target.value)}
                  className="form-select"
                  required
                >
                  <option value="">Select Type</option>
                  {REQUEST_TYPES.map(type => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                  className="form-select"
                >
                  {PRIORITY_LEVELS.map(level => (
                    <option key={level.value} value={level.value}>
                      {level.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Department <span className="text-red-500">*</span></label>
              <select
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                className="form-select"
                required
              >
                <option value="">Select Department</option>
                {departments.map(dept => (
                  <option key={dept.id} value={dept.id}>
                    {dept.name}
                  </option>
                ))}
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description <span className="text-red-500">*</span></label>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="form-input min-h-[120px]"
                placeholder="Provide detailed information about your request"
                rows="4"
                required
              ></textarea>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Supporting Files
              </label>
              <div className="border border-dashed border-gray-300 rounded-lg p-4 bg-gray-50 hover:bg-gray-100 transition-colors">
                <input
                  type="file"
                  onChange={(e) => setFile(e.target.files[0])}
                  className="w-full"
                  accept=".pdf,.jpg,.jpeg,.png,.gif,.xls,.xlsx"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Accepted formats: PDF, Images (JPG, PNG, GIF), Excel (XLS, XLSX)
                </p>
              </div>
              
              {filePreview && (
                <div className="mt-2 p-3 border rounded-lg bg-gray-50 fade-in">
                  <div className="font-medium text-sm text-gray-700 mb-1">Preview</div>
                  <img src={filePreview} alt="File preview" className="max-h-48 rounded border" />
                </div>
              )}
              
              {file && !filePreview && (
                <div className="mt-2 flex items-center gap-2 p-3 border rounded-lg bg-gray-50 fade-in">
                  <svg className="w-6 h-6 text-gray-500" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
                    <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
                  </svg>
                  <span className="text-gray-700 text-sm">{file.name}</span>
                </div>
              )}
            </div>
            
            <div className="flex justify-end space-x-3 pt-3 border-t border-gray-200">
              <button
                type="button"
                onClick={handleClose}
                className="secondary-button"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className={`primary-button flex items-center justify-center gap-2 ${loading ? 'opacity-70 cursor-not-allowed' : ''}`}
              >
                {loading ? (
                  <>
                    <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Submitting...
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path>
                    </svg>
                    Submit Request
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default RequestDialog;