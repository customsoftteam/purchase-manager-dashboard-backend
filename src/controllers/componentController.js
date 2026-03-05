// Purchase Manager: Get all vendor components
exports.getAllVendorComponents = async (req, res) => {
  try {
    // Only allow purchase manager users
    if (!req.user || req.user.type !== 'purchase_manager') {
      return res.status(403).json({ error: 'Purchase Manager authentication required' });
    }
    const { data: components, error } = await supabase
      .from('vendor_components')
      .select('*, vendorregistration:vendorregistration!fk_vendor_components_vendor_id(vendor_id, company_name, contact_person, contact_email, contact_phone), Company:companyid(companyId, company_name)')
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json({ components: components || [] });
  } catch (error) {
    console.error('Error fetching all vendor components:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch vendor components' });
  }
};
const supabase = require('../config/supabase');
const { v4: uuidv4 } = require('uuid');
// Vendor components and required components feed

// Get a single company for vendor (backward compatibility)
const getCompanyForVendor = async (vendorId) => {
  try {
    // Check if company is linked by vendor_id
    const { data: companyByLink, error: error1 } = await supabase
      .from('Company')
      .select('companyId, vendor_id')
      .eq('vendor_id', vendorId)
      .maybeSingle();

    if (companyByLink) {
      return companyByLink;
    }

    // Check if company exists with the same companyId
    const { data: companyById, error: error2 } = await supabase
      .from('Company')
      .select('companyId, vendor_id')
      .eq('companyId', vendorId)
      .maybeSingle();

    if (companyById && !companyById.vendor_id) {
      await supabase
        .from('Company')
        .update({ vendor_id: vendorId })
        .eq('companyId', companyById.companyId);
    }

    if (companyById) {
      return companyById;
    }

    // Get vendor registration details
    const { data: vendor, error: error3 } = await supabase
      .from('vendorregistration')
      .select('*')
      .eq('vendor_id', vendorId)
      .maybeSingle();

    if (!vendor) {
      console.error('Vendor not found:', vendorId);
      return null;
    }

    // Check if company exists with the same email
    const { data: companyByEmail, error: error4 } = await supabase
      .from('Company')
      .select('companyId, vendor_id')
      .eq('contact_email', vendor.contact_email)
      .maybeSingle();

    if (companyByEmail) {
      if (!companyByEmail.vendor_id) {
        await supabase
          .from('Company')
          .update({ vendor_id: vendorId })
          .eq('companyId', companyByEmail.companyId);
      }
      return companyByEmail;
    }

    // Check if company exists with the same company name
    const { data: companyByName, error: error5 } = await supabase
      .from('Company')
      .select('companyId, vendor_id')
      .eq('company_name', vendor.company_name)
      .maybeSingle();

    if (companyByName) {
      if (!companyByName.vendor_id) {
        await supabase
          .from('Company')
          .update({ vendor_id: vendorId })
          .eq('companyId', companyByName.companyId);
      }
      return companyByName;
    }

    // Create a new company if none exists
    const { data: createdCompany, error: createError } = await supabase
      .from('Company')
      .insert([
        {
          companyId: vendor.vendor_id,
          vendor_id: vendor.vendor_id,
          company_name: vendor.company_name,
          company_tin: vendor.company_tin,
          address: vendor.address,
          contact_person: vendor.contact_person,
          contact_email: vendor.contact_email,
          contact_phone: vendor.contact_phone,
          company_website: vendor.company_website,
          created_at: new Date().toISOString(),
        },
      ])
      .select()
      .maybeSingle();

    if (createError) {
      console.error('Error creating company:', createError);
      return null;
    }

    return createdCompany;
  } catch (error) {
    console.error('Error in getCompanyForVendor:', error);
    return null;
  }
};

// Get ALL companies for a vendor using the new junction table (many-to-many)
const getAllCompaniesForVendor = async (vendorId) => {
  try {
    console.log('Getting all companies for vendor using junction table:', vendorId);

    // Get vendor details to check verification status
    const { data: vendor, error: vendorError } = await supabase
      .from('vendorregistration')
      .select('*')
      .eq('vendor_id', vendorId)
      .maybeSingle();

    if (!vendor) {
      console.error('Vendor not found:', vendorId);
      return [];
    }

    console.log('Vendor found, getting companies from company_vendors table');

    // Get all companies linked to this vendor through the junction table
    const { data: relationships, error: relationshipsError } = await supabase
      .from('company_vendors')
      .select('company_id, relationship_status, is_verified, Company:company_id(companyId, company_name, contact_email)')
      .eq('vendor_id', vendorId)
      .eq('relationship_status', 'active');

    if (relationshipsError) {
      console.error('Error fetching company relationships:', relationshipsError);
      return [];
    }

    const companies = relationships?.map(rel => ({
      companyId: rel.company_id,
      company_name: rel.Company?.company_name,
      contact_email: rel.Company?.contact_email,
      relationship_status: rel.relationship_status,
      is_verified: rel.is_verified
    })) || [];

    console.log(`Found ${companies.length} companies linked to vendor via junction table`);
    return companies;
  } catch (error) {
    console.error('Error in getAllCompaniesForVendor:', error);
    return [];
  }
};

// Get vendor components (authenticated)
exports.getVendorComponents = async (req, res) => {
  try {
    // If purchase manager, return all vendor components
    if (req.user && req.user.type === 'purchase_manager') {
      const { data: components, error } = await supabase
        .from('vendor_components')
        .select('*, vendorregistration:vendorregistration!fk_vendor_components_vendor_id(vendor_id, company_name, contact_person), Company:companyid(companyId, company_name)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return res.json({ products: components || [] });
    }

    // If vendor, return only their components
    const vendorId = req.user.vendor_id;
    if (!vendorId) {
      return res.status(400).json({ error: 'Vendor ID is required' });
    }
    // Get company linked to this vendor
    const company = await getCompanyForVendor(vendorId);
    if (!company) {
      console.error('Company not found for vendor:', vendorId);
      return res.status(500).json({ error: 'Failed to get or create company for vendor', vendorId });
    }
    // Get all vendor components for this vendor/company
    const companyId = company.companyId;
    const filter = companyId
      ? `vendorid.eq.${vendorId},companyid.eq.${companyId}`
      : `vendorid.eq.${vendorId}`;
    const { data: components, error: componentsError } = await supabase
      .from('vendor_components')
      .select('*, vendorregistration:vendorregistration!fk_vendor_components_vendor_id(vendor_id, company_name, contact_person), Company:companyid(companyId, company_name)')
      .or(filter)
      .eq('is_active', true)
      .order('created_at', { ascending: false });
    if (componentsError) {
      console.error('Error fetching components:', componentsError);
      throw componentsError;
    }
    res.json({ products: components || [] });
  } catch (error) {
    console.error('Error fetching components:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch components' });
  }
};

// Get required components for vendor (authenticated)
exports.getRequiredComponents = async (req, res) => {
  try {
    const vendorId = req.user.vendor_id;

    if (!vendorId) {
      return res.status(400).json({ error: 'Vendor ID is required' });
    }

    const companies = await getAllCompaniesForVendor(vendorId);
    const companyIds = (companies || []).map(c => c.companyId).filter(Boolean);

    let query = supabase
      .from('Components')
      .select('componentId, component_code, component_name, description, unit_of_measurement, size, companyId')
      .order('created_at', { ascending: false });

    if (companyIds.length > 0) {
      query = query.in('companyId', companyIds);
    }

    const { data: components, error: componentsError } = await query;

    if (componentsError) throw componentsError;

    const requiredComponents = (components || []).map(component => ({
      requestId: component.componentId || component.component_code,
      componentId: component.componentId,
      component_code: component.component_code,
      component_name: component.component_name,
      description: component.description,
      unit_of_measurement: component.unit_of_measurement,
      size: component.size,
      companyId: component.companyId,
      isRequired: true,
    }));

    res.json({ requiredComponents });
  } catch (error) {
    console.error('Error fetching required components:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch required components' });
  }
};

// Add component for vendor
exports.addVendorComponent = async (req, res) => {
  try {
    const vendorId = req.user.vendor_id;
    const {
      component_name: title,
      description,
      item_no,
      unit_of_measurement,
      specifications,
      minor_details,
      price_per_unit: base_price,
      stock_available,
      color,
      discount_percent,
      cgst,
      sgst,
      lead_time_days: delivery_terms,
      delivery_time_range,
      minimum_order_quantity,
      hsn_code,
      img,
      size,
      component_code,
    } = req.body;

    if (!vendorId) {
      return res.status(400).json({ error: 'Vendor ID is required' });
    }

    if (!title || !item_no) {
      return res.status(400).json({ error: 'Title and item number are required' });
    }

    // Generate component ID
    const componentId = `comp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const resolvedMeasurementUnit = unit_of_measurement || null;
    const resolvedStockAvailable = stock_available ?? 0;
    const resolvedSize = size === '' ? null : size;

    const company = await getCompanyForVendor(vendorId);
    if (!company?.companyId) {
      return res.status(500).json({ error: 'Failed to resolve company for vendor' });
    }

    let resolvedComponentCode = component_code || null;
    try {
      const { data: matchedComponent, error: matchError } = await supabase
        .from('Components')
        .select('component_code')
        .eq('companyId', company.companyId)
        .eq('component_name', title)
        .maybeSingle();

      if (!matchError && matchedComponent?.component_code) {
        resolvedComponentCode = matchedComponent.component_code;
      }

      if (!resolvedComponentCode) {
        const { data: fallbackComponent, error: fallbackError } = await supabase
          .from('Components')
          .select('component_code')
          .eq('component_name', title)
          .maybeSingle();

        if (!fallbackError && fallbackComponent?.component_code) {
          resolvedComponentCode = fallbackComponent.component_code;
        }
      }
    } catch (matchErr) {
      console.error('Error matching component code:', matchErr);
    }

    if (!resolvedComponentCode) {
      try {
        const companies = await getAllCompaniesForVendor(vendorId);
        const companyIds = companies.map((comp) => comp.companyId).filter(Boolean);
        if (companyIds.length > 0) {
          const { data: multiCompanyMatch, error: multiCompanyError } = await supabase
            .from('Components')
            .select('component_code')
            .in('companyId', companyIds)
            .eq('component_name', title)
            .maybeSingle();

          if (!multiCompanyError && multiCompanyMatch?.component_code) {
            resolvedComponentCode = multiCompanyMatch.component_code;
          }
        }
      } catch (matchErr) {
        console.error('Error matching component code across companies:', matchErr);
      }
    }

    // Insert component
    const { data: component, error: componentError } = await supabase
      .from('vendor_components')
      .insert([
        {
          componentid: componentId,
          vendorid: vendorId,
          companyid: company.companyId,
          component_name: title,
          description,
          item_no,
          component_code: resolvedComponentCode,
          unit_of_measurement: resolvedMeasurementUnit,
          color: color || null,
          specifications: specifications || null,
          minor_details: minor_details || null,
          hsn_code: hsn_code || null,
          img: img || null,
          size: resolvedSize,
          price_per_unit: parseFloat(base_price) || 0,
          stock_available: parseInt(resolvedStockAvailable) || 0,
          minimum_order_quantity: parseInt(minimum_order_quantity) || 1,
          discount_percent: parseFloat(discount_percent) || 0,
          cgst: parseFloat(cgst) || 0,
          sgst: parseFloat(sgst) || 0,
          lead_time_days: parseInt(delivery_terms) || 0,
          is_active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ])
      .select()
      .single();

    if (componentError) throw componentError;

    res.status(201).json({
      message: 'Component added successfully and pending approval',
      product: component,
    });
  } catch (error) {
    console.error('Error adding component:', error);
    res.status(500).json({ error: error.message || 'Failed to add component' });
  }
};

// Delete vendor component
exports.deleteVendorComponent = async (req, res) => {
  try {
    const { componentId } = req.params;
    const vendorId = req.user.vendor_id;

    if (!vendorId) {
      return res.status(400).json({ error: 'Vendor ID is required' });
    }

    // Verify component belongs to this vendor
    const { data: component, error: componentError } = await supabase
      .from('vendor_components')
      .select('componentid')
      .eq('componentid', componentId)
      .eq('vendorid', vendorId)
      .single();

    if (componentError || !component) {
      return res.status(404).json({ error: 'Component not found or unauthorized' });
    }

    // Delete component
    const { error: deleteError } = await supabase
      .from('vendor_components')
      .delete()
      .eq('componentid', componentId);

    if (deleteError) throw deleteError;

    res.json({ message: 'Component deleted successfully' });
  } catch (error) {
    console.error('Error deleting component:', error);
    res.status(500).json({ error: error.message || 'Failed to delete component' });
  }
};

// Update vendor component
exports.updateVendorComponent = async (req, res) => {
  try {
    const { componentId } = req.params;
    const vendorId = req.user.vendor_id;
    const {
      component_name: title,
      description,
      item_no,
      unit_of_measurement,
      specifications,
      minor_details,
      price_per_unit: base_price,
      stock_available,
      color,
      discount_percent,
      cgst,
      sgst,
      lead_time_days: delivery_terms,
      delivery_time_range,
      minimum_order_quantity,
      hsn_code,
      img,
      size,
      component_code,
    } = req.body;

    if (!vendorId) {
      return res.status(400).json({ error: 'Vendor ID is required' });
    }

    // Verify component belongs to this vendor
    const { data: component, error: componentError } = await supabase
      .from('vendor_components')
      .select('componentid')
      .eq('componentid', componentId)
      .eq('vendorid', vendorId)
      .single();

    if (componentError || !component) {
      return res.status(404).json({ error: 'Component not found or unauthorized' });
    }

    const resolvedMeasurementUnit = unit_of_measurement || null;
    const resolvedStockAvailable = stock_available ?? 0;
    const resolvedSize = size === '' ? null : size;

    // Update component
    const updatePayload = {
      component_name: title,
      description,
      item_no,
      unit_of_measurement: resolvedMeasurementUnit,
      color: color || null,
      specifications: specifications || null,
      minor_details: minor_details || null,
      hsn_code: hsn_code || null,
      img: img || null,
      size: resolvedSize,
      price_per_unit: parseFloat(base_price) || 0,
      stock_available: parseInt(resolvedStockAvailable) || 0,
      minimum_order_quantity: parseInt(minimum_order_quantity) || 1,
      discount_percent: parseFloat(discount_percent) || 0,
      cgst: parseFloat(cgst) || 0,
      sgst: parseFloat(sgst) || 0,
      lead_time_days: parseInt(delivery_terms) || 0,
      updated_at: new Date().toISOString(),
    };

    if (component_code !== undefined) {
      updatePayload.component_code = component_code || null;
    }

    const { data: updatedComponent, error: updateError } = await supabase
      .from('vendor_components')
      .update(updatePayload)
      .eq('componentid', componentId)
      .select()
      .single();

    if (updateError) throw updateError;

    res.json({
      message: 'Component updated successfully',
      product: updatedComponent,
    });
  } catch (error) {
    console.error('Error updating component:', error);
    res.status(500).json({ error: error.message || 'Failed to update component' });
  }
};

// Get product components (for purchase manager - read only)
exports.getProductComponents = async (req, res) => {
  try {
    const { productId } = req.params;

    const { data: components, error } = await supabase
      .from('Components')
      .select('*')
      .eq('productId', productId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json({ components: components || [] });
  } catch (error) {
    console.error('Error fetching product components:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch product components' });
  }
};

// Update product component active status (purchase manager)
exports.updateComponentActive = async (req, res) => {
  try {
    const { componentId } = req.params;
    const { active } = req.body || {};

    if (!componentId) {
      return res.status(400).json({ error: 'Component ID is required' });
    }

    const resolvedActive = typeof active === 'boolean' ? active : true;

    const { data: component, error } = await supabase
      .from('Components')
      .update({
        active: resolvedActive,
        updated_at: new Date().toISOString(),
      })
      .eq('componentId', componentId)
      .select()
      .single();

    if (error) throw error;

    res.json({
      message: 'Component status updated successfully',
      component,
    });
  } catch (error) {
    console.error('Error updating component status:', error);
    res.status(500).json({ error: error.message || 'Failed to update component status' });
  }
};

// Get all available components from company (for vendors to add)
exports.getAvailableComponentsForVendor = async (req, res) => {
  try {
    const vendorId = req.user?.vendor_id;

    if (!vendorId) {
      console.log('No vendor ID in request');
      return res.status(400).json({ error: 'Vendor ID is required' });
    }

    console.log('Fetching available components for vendor:', vendorId);

    const companies = await getAllCompaniesForVendor(vendorId);
    const companyIds = (companies || []).map(c => c.companyId).filter(Boolean);
    console.log(`Found ${companies?.length || 0} linked companies for vendor:`, companyIds);

    // Fetch components from linked companies if available, else fallback to all companies' components
    let componentQuery = supabase
      .from('Components')
      .select('componentId, component_code, component_name, description, unit_of_measurement, size, companyId')
      .order('created_at', { ascending: false });

    if (companyIds.length > 0) {
      componentQuery = componentQuery.in('companyId', companyIds);
    }

    const { data: allComponents, error: componentsError } = await componentQuery;

    if (componentsError) {
      console.error('Error fetching components:', componentsError);
      throw componentsError;
    }

    console.log(`Found ${allComponents?.length || 0} components from Components table`);

    // Get components already supplied by this vendor
    let { data: vendorComponents, error: vendorComponentsError } = await supabase
      .from('vendor_components')
      .select('component_code')
      .eq('vendorid', vendorId)
      .eq('is_active', true);

    if (vendorComponentsError) {
      console.error('Error fetching vendor components:', vendorComponentsError);
      vendorComponents = [];
    }

    const suppliedCodes = vendorComponents?.map(vc => vc.component_code) || [];
    console.log(`Vendor already supplies ${suppliedCodes.length} components`);

    // Filter out components already supplied, sort by company and component name
    const availableComponents = (allComponents || [])
      .filter(comp => {
        return comp.component_code && !suppliedCodes.includes(comp.component_code);
      })
      .sort((a, b) => {
        if (a.companyId !== b.companyId) {
          return a.companyId.localeCompare(b.companyId);
        }
        return (a.component_name || '').localeCompare(b.component_name || '');
      });

    console.log(`Returning ${availableComponents.length} available components`);

    res.json({ 
      components: availableComponents,
      companies: companies.map(c => ({ id: c.companyId, name: c.company_name })),
      stats: {
        vendorAssociatedCompanies: companies.length,
        totalComponentsFromCompanies: allComponents?.length || 0,
        alreadySuppliedByVendor: suppliedCodes.length,
        availableToAdd: availableComponents.length
      }
    });
  } catch (error) {
    console.error('Error fetching available components:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch available components' });
  }
};

// Add component from company's component list (vendor supplies existing component)
exports.addAvailableComponent = async (req, res) => {
  try {
    const vendorId = req.user?.vendor_id;
    const {
      componentCode,
      pricePerUnit,
      currentStock,
      leadTimeDays,
      minOrderQuantity,
      discount,
    } = req.body;

    // 🔹 Basic validation
    if (!vendorId) {
      return res.status(401).json({ error: "Vendor authentication required" });
    }

    if (!componentCode || pricePerUnit === undefined) {
      return res
        .status(400)
        .json({ error: "Component code and price are required" });
    }

    // 🔹 Get companies mapped to vendor
    const companies = await getAllCompaniesForVendor(vendorId);
    const companyIds = companies.map((c) => c.companyId).filter(Boolean);

    if (companyIds.length === 0) {
      return res
        .status(400)
        .json({ error: "No companies associated with this vendor" });
    }

    // 🔹 Fetch component master
    const { data: component, error: componentError } = await supabase
      .from("Components")
      .select("*")
      .eq("component_code", componentCode)
      .in("companyId", companyIds)
      .maybeSingle();

    if (componentError) throw componentError;
    if (!component) {
      return res.status(404).json({ error: "Component not found" });
    }

    // 🔹 Check duplicate
    const { data: existing } = await supabase
      .from("vendor_components")
      .select("componentid")
      .eq("vendorid", vendorId)
      .eq("component_code", componentCode)
      .maybeSingle();

    if (existing) {
      return res
        .status(409)
        .json({ error: "You already supply this component" });
    }

    const vendorComponentId = `vc_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 10)}`;

    // 🔹 Insert
    const { data: newComponent, error: insertError } = await supabase
      .from("vendor_components")
      .insert([
        {
          componentid: vendorComponentId,
          vendorid: vendorId,
          companyid: component.companyId,
          component_code: componentCode,
          component_name: component.component_name,
          description: component.description,
          item_no: component.item_no,
          unit_of_measurement: component.unit_of_measurement,
          hsn_code: component.hsn_code,
          color: component.color,
          img: component.img,
          size: component.size,
          specifications: component.specifications,
          price_per_unit: Number(pricePerUnit),
          stock_available: Number(currentStock) || 0,
          minimum_order_quantity: Number(minOrderQuantity) || 1,
          lead_time_days: Number(leadTimeDays) || 0,
          cgst: Number(component.cgst) || 0,
          sgst: Number(component.sgst) || 0,
          discount_percent: Number(discount) || 0,
          is_active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ])
      .select()
      .single();

    if (insertError) throw insertError;

    return res.status(201).json({
      message: "Component added successfully",
      component: newComponent,
    });
  } catch (error) {
    console.error("Error adding available component:", error);
    return res.status(500).json({ error: "Failed to add component" });
  }
};

// ============================================================
// COMPONENT APPROVAL WORKFLOW
// ============================================================

// PM: Approve a vendor component
exports.approveVendorComponent = async (req, res) => {
  try {
    const { componentId } = req.params;
    const isPurchaseManager = req.user?.type === 'purchase_manager';

    if (!isPurchaseManager) {
      return res.status(401).json({ error: 'Purchase Manager authentication required' });
    }

    if (!componentId) {
      return res.status(400).json({ error: 'Component ID is required' });
    }

    const { data: updatedComponent, error } = await supabase
      .from('vendor_components')
      .update({
        status: 'approved',
        rejection_reason: null,
        updated_at: new Date().toISOString(),
      })
      .eq('componentid', componentId)
      .select()
      .single();

    if (error) throw error;

    res.json({
      message: 'Component approved successfully',
      component: updatedComponent,
    });
  } catch (error) {
    console.error('Error approving vendor component:', error);
    res.status(500).json({ error: error.message || 'Failed to approve component' });
  }
};

// PM: Reject a vendor component with reason
exports.rejectVendorComponent = async (req, res) => {
  try {
    const { componentId } = req.params;
    const { rejectionReason } = req.body;
    const isPurchaseManager = req.user?.type === 'purchase_manager';

    if (!isPurchaseManager) {
      return res.status(401).json({ error: 'Purchase Manager authentication required' });
    }

    if (!componentId) {
      return res.status(400).json({ error: 'Component ID is required' });
    }

    if (!rejectionReason || !rejectionReason.trim()) {
      return res.status(400).json({ error: 'Rejection reason is required' });
    }

    const { data: updatedComponent, error } = await supabase
      .from('vendor_components')
      .update({
        status: 'rejected',
        rejection_reason: rejectionReason.trim(),
        updated_at: new Date().toISOString(),
      })
      .eq('componentid', componentId)
      .select()
      .single();

    if (error) throw error;

    res.json({
      message: 'Component rejected successfully',
      component: updatedComponent,
    });
  } catch (error) {
    console.error('Error rejecting vendor component:', error);
    res.status(500).json({ error: error.message || 'Failed to reject component' });
  }
};

// Vendor: Update component (resets to pending if was rejected)
exports.updateVendorComponent = async (req, res) => {
  try {
    const { componentId } = req.params;
    const vendorId = req.user?.vendor_id;
    const payload = req.body || {};

    if (!vendorId) {
      return res.status(401).json({ error: "Vendor authentication required" });
    }

    if (!componentId) {
      return res.status(400).json({ error: "Component ID is required" });
    }

    // 1️⃣ Fetch component
    const { data: currentComponent, error: fetchError } = await supabase
      .from("vendor_components")
      .select("status, vendorid")
      .eq("componentid", componentId)
      .maybeSingle();

    if (fetchError) throw fetchError;

    if (!currentComponent) {
      return res.status(404).json({ error: "Component not found" });
    }

    // 2️⃣ Ownership check
    if (currentComponent.vendorid !== vendorId) {
      return res.status(403).json({ error: "Unauthorized to update this component" });
    }

    // 3️⃣ Build safe update object (supports both camelCase and snake_case)
    const pick = (...keys) => {
      for (const key of keys) {
        if (payload[key] !== undefined) return payload[key];
      }
      return undefined;
    };

    const updates = { updated_at: new Date().toISOString() };

    const componentName = pick('component_name', 'componentName', 'name');
    if (componentName !== undefined) updates.component_name = componentName;

    const category = pick('category');
    if (category !== undefined) updates.category = category;

    const subcategory = pick('subcategory');
    if (subcategory !== undefined) updates.subcategory = subcategory;

    const description = pick('description');
    if (description !== undefined) updates.description = description;

    const specifications = pick('specifications');
    if (specifications !== undefined) updates.specifications = specifications;

    const itemNo = pick('item_no', 'itemNo');
    if (itemNo !== undefined) updates.item_no = itemNo;

    const unitOfMeasurement = pick('unit_of_measurement', 'unitOfMeasurement', 'unit');
    if (unitOfMeasurement !== undefined) updates.unit_of_measurement = unitOfMeasurement;

    const pricePerUnit = pick('price_per_unit', 'pricePerUnit', 'base_price');
    if (pricePerUnit !== undefined) updates.price_per_unit = parseFloat(pricePerUnit) || 0;

    const stockAvailable = pick('stock_available', 'stockAvailable');
    if (stockAvailable !== undefined) updates.stock_available = parseInt(stockAvailable) || 0;

    const minimumOrderQuantity = pick('minimum_order_quantity', 'minimumOrderQuantity', 'moq');
    if (minimumOrderQuantity !== undefined) updates.minimum_order_quantity = parseInt(minimumOrderQuantity) || 1;

    const leadTimeDays = pick('lead_time_days', 'leadTimeDays', 'delivery_terms');
    if (leadTimeDays !== undefined) updates.lead_time_days = parseInt(leadTimeDays) || 0;

    const discountPercent = pick('discount_percent', 'discountPercent');
    if (discountPercent !== undefined) updates.discount_percent = parseFloat(discountPercent) || 0;

    const cgst = pick('cgst');
    if (cgst !== undefined) updates.cgst = parseFloat(cgst) || 0;

    const sgst = pick('sgst');
    if (sgst !== undefined) updates.sgst = parseFloat(sgst) || 0;

    const gst = pick('gst');
    if (gst !== undefined) updates.gst = parseFloat(gst) || 0;

    const color = pick('color');
    if (color !== undefined) updates.color = color;

    const hsnCode = pick('hsn_code', 'hsnCode');
    if (hsnCode !== undefined) updates.hsn_code = hsnCode;

    const size = pick('size');
    if (size !== undefined) updates.size = size === '' ? null : size;

    const img = pick('img', 'image', 'image_url');
    if (img !== undefined) updates.img = img;

    const componentCode = pick('component_code', 'componentCode');
    if (componentCode !== undefined) updates.component_code = componentCode;

    // 4️⃣ Auto resubmission logic
    let resubmitted = false;
    if (currentComponent.status === "rejected") {
      updates.status = "pending";
      updates.rejection_reason = null;
      resubmitted = true;
    }

    // 5️⃣ Update with vendor scope (important)
    const { data: updatedComponent, error: updateError } = await supabase
      .from("vendor_components")
      .update(updates)
      .eq("componentid", componentId)
      .eq("vendorid", vendorId)
      .select()
      .single();

    if (updateError) throw updateError;

    return res.status(200).json({
      message: "Component updated successfully",
      component: updatedComponent,
      resubmitted,
    });

  } catch (err) {
    console.error("Error updating vendor component:", err);
    return res.status(500).json({
      error: "Failed to update component",
    });
  }
};


exports.getComponentVendors = async (req, res) => {
  try {
    const { componentCode } = req.params;
    const { componentName } = req.query;

    if (!componentCode && !componentName) {
      return res
        .status(400)
        .json({ error: "Component code or name is required" });
    }

    let query = supabase
      .from("vendor_components")
      .select(
        "*, vendorregistration:vendorregistration!fk_vendor_components_vendor_id(vendor_id, company_name, contact_email, contact_phone)"
      )
      .eq("is_active", true)
      .order("price_per_unit", { ascending: true });

    if (componentName) {
      query = query.eq("component_name", componentName);
    } else {
      query = query.eq("component_code", componentCode);
    }

    const { data: vendors, error } = await query;
    if (error) throw error;

    if (vendors?.length) {
      return res.json({ vendors });
    }

    // 🔹 fallback by component master name
    if (!componentName) {
      const { data: component } = await supabase
        .from("Components")
        .select("component_name")
        .eq("component_code", componentCode)
        .maybeSingle();

      if (component?.component_name) {
        const { data: fallback } = await supabase
          .from("vendor_components")
          .select(
            "*, vendorregistration:vendorregistration!fk_vendor_components_vendor_id(vendor_id, company_name, contact_email, contact_phone)"
          )
          .eq("component_name", component.component_name)
          .eq("is_active", true)
          .order("price_per_unit", { ascending: true });

        return res.json({ vendors: fallback || [] });
      }
    }

    return res.json({ vendors: [] });
  } catch (error) {
    console.error("Error fetching component vendors:", error);
    return res.status(500).json({ error: "Failed to fetch vendors" });
  }
};

// Purchase Manager: Get all components from components table
exports.getAllComponents = async (req, res) => {
  try {
    const { data: components, error } = await supabase
      .from('Components')
      .select('*')
      .order('created_at', { ascending: false });
      
    if (error) throw error;
    
    res.json({ components: components || [] });
  } catch (error) {
    console.error('Error fetching all components:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch components' });
  }
};
