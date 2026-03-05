// Company profile CRUD controller
const supabase = require('../config/supabase');
const { v4: uuidv4 } = require('uuid');

// Create Company
exports.createCompany = async (req, res) => {
  try {
    const { company_name, company_tin, address, contact_person, contact_email, contact_phone, logo_image, company_website } = req.body;

    if (!company_name || !contact_email) {
      return res.status(400).json({ error: 'Company name and contact email are required' });
    }

    const { data, error } = await supabase
      .from('Company')
      .insert([
        {
          companyId: uuidv4(),
          company_name,
          company_tin: company_tin || null,
          address: address || null,
          contact_person: contact_person || null,
          contact_email,
          contact_phone: contact_phone || null,
          logo_image: logo_image || null,
          company_website: company_website || null,
          created_at: new Date().toISOString(),
        },
      ])
      .select();

    if (error) return res.status(400).json({ error: error.message });

    res.status(201).json({ message: 'Company created successfully', data: data[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get All Companies
exports.getAllCompanies = async (req, res) => {
  try {
    let query = supabase.from('Company').select('*');

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) return res.status(400).json({ error: error.message });

    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get Single Company
exports.getCompany = async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('Company')
      .select('*')
      .eq('companyId', id)
      .single();

    if (error) return res.status(404).json({ error: 'Company not found' });

    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Update Company
exports.updateCompany = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const { data, error } = await supabase
      .from('Company')
      .update({ ...updates, upated_at: new Date().toISOString() })
      .eq('companyId', id)
      .select();

    if (error) return res.status(400).json({ error: error.message });

    res.json({ message: 'Company updated successfully', data: data[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Delete Company
exports.deleteCompany = async (req, res) => {
  try {
    const { id } = req.params;

    const { error } = await supabase
      .from('Company')
      .delete()
      .eq('companyId', id);

    if (error) return res.status(400).json({ error: error.message });

    res.json({ message: 'Company deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
