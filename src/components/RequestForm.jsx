import { useState, useContext, useEffect } from 'react';
import { AuthContext } from './AuthProvider';

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

function PriorityBadge({ priority }) {
  const colors = {
    low: 'bg-green-100 text-green-800 ring-1 ring-green-300',
    medium: 'bg-blue-100 text-blue-800 ring-1 ring-blue-300',
    high: 'bg-orange-100 text-orange-800 ring-1 ring-orange-300',
    urgent: 'bg-red-100 text-red-800 ring-1 ring-red-300'
  };
  
  const icons = {
    low: (
      <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
        <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
      </svg>
    ),
    medium: (
      <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
        <path fillRule="evenodd" d="M10 3a1 1 0 01.707.293l1 1a1 1 0 01-1.414 1.414L10 5.414 8.707 6.707a1 1 0 01-1.414-1.414l1-1A1 1 0 0110 3zm-3.707 9.293a1 1 0 011.414 0L10 14.586l2.293-2.293a1 1 0 011.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
      </svg>
    ),
    high: (
      <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
        <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
      </svg>
    ),
    urgent: (
      <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
      </svg>
    )
  };
  
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${colors[priority]}`}>
      {icons[priority]}
      {priority.charAt(0).toUpperCase() + priority.slice(1)}
    </span>
  );
}

function RequestForm({ onRequestSubmitted }) {
  const { session, supabase } = useContext(AuthContext);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [requestType, setRequestType] = useState('');
  const [priority, setPriority] = useState('medium');
  const [file, setFile] = useState(null);
  const [departments, setDepartments] = useState([]);
  const [department, setDepartment] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [profile, setProfile] = useState(null);
  const [filePreview, setFilePreview] = useState(null);
  const [formTouched, setFormTouched] = useState(false);
  const [characterCount, setCharacterCount] = useState(0);

  useEffect(() => {
    if (!session?.user) return;

    const fetchUserProfile = async () => {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', session.user.id)
          .single();

        if (error) {
          console.error('Error fetching profile:', error);
          return;
        }

        setProfile(data);
        if (data.department_id) {
          setDepartment(data.department_id);
        }
      } catch (err) {
        console.error('Unexpected error fetching profile:', err);
      }
    };

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

        setDepartments(data);
      } catch (err) {
        console.error('Unexpected error fetching departments:', err);
      }
    };

    fetchUserProfile();
    fetchDepartments();
  }, [session, supabase]);

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

  const handleDescriptionChange = (e) => {
    setDescription(e.target.value);
    setCharacterCount(e.target.value.length);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!session?.user) return;

    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      // Form validation
      if (!title.trim()) {
        throw new Error('Please enter a request title');
      }
      
      if (!description.trim()) {
        throw new Error('Please provide a description');
      }
      
      if (!requestType) {
        throw new Error('Please select a request type');
      }
      
      if (!department) {
        throw new Error('Please select a department');
      }

      let attachmentUrl = null;

      // Upload file if provided
      if (file) {
        const fileExt = file.name.split('.').pop();
        const allowedTypes = ['pdf', 'jpg', 'jpeg', 'png', 'gif', 'xls', 'xlsx'];
        
        if (!allowedTypes.includes(fileExt.toLowerCase())) {
          throw new Error('File type not supported. Please upload PDF, Image, or Excel files only.');
        }
        
        const fileName = `${session.user.id}_${Date.now()}.${fileExt}`;
        
        const { error: uploadError } = await supabase.storage
          .from('request-attachments')
          .upload(fileName, file);

        if (uploadError) {
          throw uploadError;
        }

        const { data: { publicUrl } } = supabase.storage
          .from('request-attachments')
          .getPublicUrl(fileName);

        attachmentUrl = publicUrl;
      }

      // Create request record
      const { error: requestError } = await supabase
        .from('examination_requests')
        .insert({
          student_id: session.user.id,
          title,
          description,
          request_type: requestType,
          priority,
          department_id: department,
          attachments: attachmentUrl ? [attachmentUrl] : [],
          status: 'pending'
        });

      if (requestError) {
        throw requestError;
      }

      setSuccess(true);
      setTitle('');
      setDescription('');
      setRequestType('');
      setPriority('medium');
      setFile(null);
      setFilePreview(null);
      setCharacterCount(0);
      setFormTouched(false);
      
      if (onRequestSubmitted) {
        onRequestSubmitted();
      }
      
      // Auto-hide success message after 5 seconds
      setTimeout(() => {
        setSuccess(false);
      }, 5000);
      
    } catch (err) {
      console.error('Error submitting request:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      {error && (
        <div className="mb-4 p-3 bg-red-100 text-red-700 rounded-lg border border-red-200 flex items-center gap-2 animate-fadeIn">
          <svg className="w-5 h-5 shrink-0" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
          <span>{error}</span>
        </div>
      )}
      
      {success && (
        <div className="mb-4 p-3 bg-green-100 text-green-700 rounded-lg border border-green-200 flex items-center gap-2 animate-fadeIn">
          <svg className="w-5 h-5 shrink-0" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
          <span>Request submitted successfully!</span>
        </div>
      )}
      
      <form onSubmit={handleSubmit} className="space-y-4" onChange={() => setFormTouched(true)}>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Request Title</label>
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
            <label className="block text-sm font-medium text-gray-700 mb-1">Request Type</label>
            <select
              value={requestType}
              onChange={(e) => setRequestType(e.target.value)}
              className="form-select"
              required
            >
              <option value="">Select Request Type</option>
              {REQUEST_TYPES.map(type => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
            <div className="relative">
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="form-select pr-12"
              >
                {PRIORITY_LEVELS.map(level => (
                  <option key={level.value} value={level.value}>
                    {level.label}
                  </option>
                ))}
              </select>
              <div className="absolute right-3 top-1/2 transform -translate-y-1/2 pointer-events-none">
                <PriorityBadge priority={priority} />
              </div>
            </div>
          </div>
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
          <select
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
            className="form-select"
            required
            disabled={departments.length === 0}
          >
            <option value="">Select Department</option>
            {departments.map(dept => (
              <option key={dept.id} value={dept.id}>
                {dept.name}
              </option>
            ))}
          </select>
          {departments.length === 0 && (
            <p className="text-xs text-gray-500 mt-1">Loading departments...</p>
          )}
        </div>
        
        <div>
          <div className="flex justify-between items-center mb-1">
            <label className="block text-sm font-medium text-gray-700">Description</label>
            <span className={`text-xs ${characterCount > 500 ? 'text-red-500' : 'text-gray-500'}`}>
              {characterCount}/1000 characters
            </span>
          </div>
          <textarea
            value={description}
            onChange={handleDescriptionChange}
            className="form-input min-h-[120px]"
            placeholder="Provide detailed information about your request"
            rows="4"
            maxLength={1000}
            required
          ></textarea>
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Supporting Files (Optional)
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
            <div className="mt-2 p-3 border rounded-lg bg-gray-50">
              <div className="font-medium text-sm text-gray-700 mb-1">Preview</div>
              <img src={filePreview} alt="File preview" className="max-h-48 rounded border" />
            </div>
          )}
          
          {file && !filePreview && (
            <div className="mt-2 flex items-center gap-2 p-3 border rounded-lg bg-gray-50">
              <svg className="w-6 h-6 text-gray-500" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
                <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
              </svg>
              <div>
                <span className="text-gray-700 text-sm font-medium">{file.name}</span>
                <span className="text-xs text-gray-500 block">{(file.size / 1024).toFixed(1)} KB</span>
              </div>
            </div>
          )}
        </div>
        
        <div className="pt-3">
          <button
            type="submit"
            disabled={loading}
            className={`primary-button w-full flex items-center justify-center gap-2 ${loading ? 'opacity-70 cursor-not-allowed' : ''}`}
          >
            {loading ? (
              <>
                <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Submitting Request...
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
  );
}

export default RequestForm;