// Legacy company request CRUD (kept for compatibility)
const supabase = require('../config/supabase');
const { v4: uuidv4 } = require('uuid');

// Create Company Request
exports.createRequest = async (req, res) => {
  try {
    const companyId = req.body.companyId || req.body.companyid;
    const requestType = req.body.request_type || req.body.requestType;
    const productId = req.body.productId || req.body.productid || null;
    const { description } = req.body;

    if (!requestType) {
      return res.status(400).json({ error: 'Request type is required' });
    }

    const { data, error } = await supabase
      .from('purchase_requests')
      .insert([
        {
          requestid: uuidv4(),
          companyid: companyId || null,
          request_type: requestType,
          productid: productId,
          description: description || null,
          status: 'pending',
          created_at: new Date().toISOString(),
        },
      ])
      .select();

    if (error) return res.status(400).json({ error: error.message });

    res.status(201).json({ message: 'Request created successfully', data: data[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get Company Requests
exports.getCompanyRequests = async (req, res) => {
  try {
    const { companyId } = req.params;

    const { data, error } = await supabase
      .from('purchase_requests')
      .select('*')
      .eq('companyid', companyId)
      .order('created_at', { ascending: false });

    if (error) return res.status(400).json({ error: error.message });

    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get All Requests
exports.getAllRequests = async (req, res) => {
  try {
    const { status } = req.query;

    let query = supabase
      .from('purchase_requests')
      .select('*');

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) return res.status(400).json({ error: error.message });

    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Update Request Status
exports.updateRequestStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({ error: 'Status is required' });
    }

    const { data, error } = await supabase
      .from('purchase_requests')
      .update({
        status,
        updated_at: new Date().toISOString(),
      })
      .or(`requestid.eq.${id},id.eq.${id}`)
      .select();

    if (error) return res.status(400).json({ error: error.message });

    res.json({ message: 'Request status updated', data: data[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Delete Request
exports.deleteRequest = async (req, res) => {
  try {
    const { id } = req.params;

    const { error } = await supabase
      .from('purchase_requests')
      .delete()
      .or(`requestid.eq.${id},id.eq.${id}`);

    if (error) return res.status(400).json({ error: error.message });

    res.json({ message: 'Request deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
