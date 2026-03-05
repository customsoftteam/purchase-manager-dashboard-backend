// Product catalog and vendor product endpoints
const supabase = require('../config/supabase');
const { v4: uuidv4 } = require('uuid');

// Create Product
exports.createProduct = async (req, res) => {
  try {
    const {
      companyId,
      title,
      description,
      item_no,
      size,
      active,
      stock,
      discount_percent,
      delivery_terms,
      cgst,
      sgst,
      delivery_time_range,
    } = req.body;

    if (!title || !item_no || !companyId) {
      return res.status(400).json({ error: 'Company ID, title, and item number are required' });
    }

    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from('Products')
      .insert([
        {
          productId: `prod_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          companyId,
          title,
          description: description || null,
          item_no,
          size: size || null,
          active: active !== undefined ? active : true,
          stock: parseInt(stock ?? 0, 10),
          discount_percent: parseFloat(discount_percent) || 0,
          delivery_terms: parseInt(delivery_terms ?? 0, 10),
          cgst: parseFloat(cgst) || 0,
          sgst: parseFloat(sgst) || 0,
          delivery_time_range: delivery_time_range || null,
          created_at: now,
          upated_at: now,
        },
      ])
      .select();

    if (error) return res.status(400).json({ error: error.message });

    res.status(201).json({ message: 'Product created successfully', data: data[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get All Products
exports.getAllProducts = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('Products')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) return res.status(400).json({ error: error.message });

    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get Single Product
exports.getProduct = async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('Products')
      .select('*')
      .eq('productId', id)
      .single();

    if (error) return res.status(404).json({ error: 'Product not found' });

    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Update Product
exports.updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const normalizedUpdates = {
      ...updates,
      upated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('Products')
      .update(normalizedUpdates)
      .eq('productId', id)
      .select();

    if (error) return res.status(400).json({ error: error.message });

    res.json({ message: 'Product updated successfully', data: data[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Delete Product
exports.deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;

    const { error } = await supabase
      .from('Products')
      .delete()
      .eq('productId', id);

    if (error) return res.status(400).json({ error: error.message });

    res.json({ message: 'Product deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Update Daily Price (deprecated for new product schema)
exports.updateDailyPrice = async (req, res) => {
  return res.status(400).json({ error: 'Daily price updates are not supported for the current product schema.' });
};

// Get Price History
exports.getPriceHistory = async (req, res) => {
  try {
    const { productId } = req.params;

    const { data, error } = await supabase
      .from('PriceHistory')
      .select('*')
      .eq('productId', productId)
      .order('effective_date', { ascending: false });

    if (error) return res.status(400).json({ error: error.message });

    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get all vendor products (for purchase manager)
exports.getAllVendorProducts = async (req, res) => {
  try {
    const { companyId } = req.query;

    let query = supabase
      .from('vendor_components')
      .select('*, vendorregistration:vendorregistration!fk_vendor_components_vendor_id(company_name, contact_person), Company(company_name)')
      .order('created_at', { ascending: false });

    if (companyId) {
      query = query.eq('companyid', companyId);
    }

    const { data: products, error } = await query;

    if (error) throw error;

    const rows = products || [];

    if (rows.length > 0) {
      const componentCodes = Array.from(
        new Set(rows.map((row) => row.component_code).filter(Boolean))
      );
      const componentNames = Array.from(
        new Set(rows.map((row) => row.component_name).filter(Boolean))
      );

      let byCodeMatches = [];
      if (componentCodes.length > 0) {
        const { data: codeMatches, error: codeError } = await supabase
          .from('Components')
          .select('component_code, component_name, productId')
          .in('component_code', componentCodes);

        if (!codeError && codeMatches) {
          byCodeMatches = codeMatches;
        }
      }

      let byNameMatches = [];
      if (componentNames.length > 0) {
        let nameQuery = supabase
          .from('Components')
          .select('component_code, component_name, productId')
          .in('component_name', componentNames);

        if (companyId) {
          nameQuery = nameQuery.eq('companyId', companyId);
        }

        const { data: nameMatches, error: nameError } = await nameQuery;
        if (!nameError && nameMatches) {
          byNameMatches = nameMatches;
        }
      }

      const byCodeLookup = byCodeMatches.reduce((acc, entry) => {
        if (!acc[entry.component_code]) acc[entry.component_code] = entry;
        return acc;
      }, {});
      const byNameLookup = byNameMatches.reduce((acc, entry) => {
        if (!acc[entry.component_name]) acc[entry.component_name] = entry;
        return acc;
      }, {});

      const productIds = Array.from(
        new Set(
          [...byCodeMatches, ...byNameMatches]
            .map((entry) => entry.productId)
            .filter(Boolean)
        )
      );

      let productLookup = {};
      if (productIds.length > 0) {
        const { data: productRows, error: productError } = await supabase
          .from('Products')
          .select('productId, title')
          .in('productId', productIds);

        if (!productError && productRows) {
          productLookup = productRows.reduce((acc, entry) => {
            acc[entry.productId] = entry.title;
            return acc;
          }, {});
        }
      }

      rows.forEach((row) => {
        const match = row.component_code
          ? byCodeLookup[row.component_code]
          : byNameLookup[row.component_name];

        if (!row.component_code && match?.component_code) {
          row.component_code = match.component_code;
        }

        if (!row.productId && match?.productId) {
          row.productId = match.productId;
        }

        if (!row.product_name && match?.productId && productLookup[match.productId]) {
          row.product_name = productLookup[match.productId];
        }
      });
    }

    res.json({ products: rows });
  } catch (error) {
    console.error('Error fetching vendor components:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch vendor components' });
  }
};

