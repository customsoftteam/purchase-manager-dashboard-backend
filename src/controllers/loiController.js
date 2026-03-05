const supabase = require('../config/supabase');

/* =========================================================
   CREATE LOI
   ========================================================= */
exports.createLOI = async (req, res) => {
  try {
    console.log('LOI Controller - createLOI called');
    console.log('Request body:', req.body);
    console.log('User:', req.user);
    
    const {
      quotationId,
      counterQuotationId,
      totalAmount,
      advancePaymentPercent,
      expectedDeliveryDate,
      termsAndConditions,
    } = req.body;

    const purchaseManagerId = req.user?.vendor_id;

    if (!quotationId || !totalAmount) {
      return res.status(400).json({
        error: 'Missing required fields: quotationId, totalAmount',
      });
    }

    /* ---------- Fetch quotation ---------- */
    const { data: quotation, error: quotationError } = await supabase
      .from('purchase_quotation')
      .select('*')
      .eq('quotation_id', quotationId)
      .single();

    if (quotationError || !quotation) {
      return res.status(404).json({ error: 'Quotation not found' });
    }

    const vendorId = quotation.vendor_id;

    /* ---------- Generate IDs ---------- */
    const loiId = `pl_${Date.now()}_${Math.random()
      .toString(36)
      .substring(2, 9)}`;
    const loiNumber = `LOI-${Date.now()}`;

    /* ---------- Insert LOI ---------- */
    const { data: loi, error } = await supabase
      .from('purchase_loi')
      .insert([
        {
          loi_id: loiId,
          quotation_id: quotationId,
          counter_quotation_id: counterQuotationId || null,
          vendor_id: vendorId,
          purchase_manager_id: purchaseManagerId,
          loi_number: loiNumber,
          loi_date: new Date().toISOString(),
          total_amount: totalAmount,
          advance_payment_percent: advancePaymentPercent || 0,
          final_payment_percent: 100 - (advancePaymentPercent || 0),
          expected_delivery_date: expectedDeliveryDate || null,
          terms_and_conditions: termsAndConditions || null,
          status: 'sent',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ])
      .select()
      .single();

    if (error) throw error;

    /* ---------- Update quotation ---------- */
    await supabase
      .from('purchase_quotation')
      .update({ status: 'approved', updated_at: new Date().toISOString() })
      .eq('quotation_id', quotationId);

    res.status(201).json({
      message: 'Purchase LOI created successfully',
      loi,
    });
  } catch (error) {
    console.error('CREATE LOI ERROR:', error);
    res.status(500).json({ error: error.message || 'Failed to create LOI' });
  }
};

/* =========================================================
   GET LOI BY ID
   ========================================================= */
exports.getLOI = async (req, res) => {
  try {
    const { loiId } = req.params;

    const { data: loi, error } = await supabase
      .from('purchase_loi')
      .select('*')
      .eq('loi_id', loiId)
      .single();

    if (error || !loi) {
      return res.status(404).json({ error: 'LOI not found' });
    }

    res.json({ loi });
  } catch (error) {
    console.error('GET LOI ERROR:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch LOI' });
  }
};

/* =========================================================
   GET ALL LOIs
   ========================================================= */
exports.getAllLOIs = async (req, res) => {
  try {
    const { vendorId, status, quotationId } = req.query;

    let query = supabase.from('purchase_loi').select('*');

    if (vendorId) query = query.eq('vendor_id', vendorId);
    if (status) query = query.eq('status', status);
    if (quotationId) query = query.eq('quotation_id', quotationId);

    const { data: lois, error } = await query.order('created_at', {
      ascending: false,
    });

    if (error) throw error;

    res.json({
      lois: lois || [],
      total: lois?.length || 0,
    });
  } catch (error) {
    console.error('GET LOIs ERROR:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch LOIs' });
  }
};

/* =========================================================
   UPDATE LOI
   ========================================================= */
exports.updateLOI = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      quotationId,
      counterQuotationId,
      totalAmount,
      advancePaymentPercent,
      expectedDeliveryDate,
      termsAndConditions,
      status,
    } = req.body;

    console.log('LOI Controller - updateLOI called for ID:', id);
    console.log('Update payload:', req.body);

    // Fetch existing LOI
    const { data: existingLoi, error: fetchError } = await supabase
      .from('purchase_loi')
      .select('*')
      .eq('loi_id', id)
      .single();

    if (fetchError || !existingLoi) {
      return res.status(404).json({ error: 'LOI not found' });
    }

    // Build update object - only update provided fields
    const updateData = {
      updated_at: new Date().toISOString(),
    };

    if (quotationId !== undefined) updateData.quotation_id = quotationId;
    if (counterQuotationId !== undefined) updateData.counter_quotation_id = counterQuotationId;
    if (totalAmount !== undefined) updateData.total_amount = totalAmount;
    if (advancePaymentPercent !== undefined) {
      updateData.advance_payment_percent = advancePaymentPercent;
      updateData.final_payment_percent = 100 - advancePaymentPercent;
    }
    if (expectedDeliveryDate !== undefined) updateData.expected_delivery_date = expectedDeliveryDate;
    if (termsAndConditions !== undefined) updateData.terms_and_conditions = termsAndConditions;
    if (status !== undefined) updateData.status = status;

    // Update LOI
    const { data: updated, error } = await supabase
      .from('purchase_loi')
      .update(updateData)
      .eq('loi_id', id)
      .select()
      .single();

    if (error) throw error;

    res.json({
      message: 'LOI updated successfully',
      loi: updated,
    });
  } catch (error) {
    console.error('UPDATE LOI ERROR:', error);
    res.status(500).json({ error: error.message || 'Failed to update LOI' });
  }
};

/* =========================================================
   ACCEPT LOI
   ========================================================= */
exports.acceptLOI = async (req, res) => {
  try {
    const { loiId } = req.params;
    const vendorId = req.user?.vendor_id;

    if (!vendorId) {
      return res.status(401).json({ error: 'Vendor authentication required' });
    }

    const { data: loi, error: fetchError } = await supabase
      .from('purchase_loi')
      .select('*')
      .eq('loi_id', loiId)
      .single();

    if (fetchError || !loi) {
      return res.status(404).json({ error: 'LOI not found' });
    }

    if (String(loi.vendor_id) !== String(vendorId)) {
      return res.status(403).json({ error: 'Unauthorized to accept this LOI' });
    }

    if (loi.status !== 'sent') {
      return res.status(400).json({ error: 'LOI already processed' });
    }

    const { data: updated, error } = await supabase
      .from('purchase_loi')
      .update({
        status: 'accepted',
        vendor_response_date: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('loi_id', loiId)
      .select()
      .single();

    if (error) throw error;

    res.json({
      message: 'LOI accepted successfully',
      loi: updated,
    });
  } catch (error) {
    console.error('ACCEPT LOI ERROR:', error);
    res.status(500).json({ error: error.message || 'Failed to accept LOI' });
  }
};

/* =========================================================
   REJECT LOI
   ========================================================= */
exports.rejectLOI = async (req, res) => {
  try {
    const { loiId } = req.params;
    const vendorId = req.user?.vendor_id;

    if (!vendorId) {
      return res.status(401).json({ error: 'Vendor authentication required' });
    }

    const { data: loi, error: fetchError } = await supabase
      .from('purchase_loi')
      .select('*')
      .eq('loi_id', loiId)
      .single();

    if (fetchError || !loi) {
      return res.status(404).json({ error: 'LOI not found' });
    }

    if (String(loi.vendor_id) !== String(vendorId)) {
      return res.status(403).json({ error: 'Unauthorized to reject this LOI' });
    }

    if (loi.status !== 'sent') {
      return res.status(400).json({ error: 'LOI already processed' });
    }

    const { data: updated, error } = await supabase
      .from('purchase_loi')
      .update({
        status: 'rejected',
        vendor_response_date: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('loi_id', loiId)
      .select()
      .single();

    if (error) throw error;

    res.json({
      message: 'LOI rejected successfully',
      loi: updated,
    });
  } catch (error) {
    console.error('REJECT LOI ERROR:', error);
    res.status(500).json({ error: error.message || 'Failed to reject LOI' });
  }
};