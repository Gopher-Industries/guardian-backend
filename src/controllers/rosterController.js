const Roster = require('../models/Roster');
const User = require('../models/User');

const staffPopulation = {
  path: 'assignedStaff',
  select: 'fullname email role',
  populate: {
    path: 'role',
    select: 'name'
  }
};

async function validateStaff(staffId) {
  const staff = await User.findById(staffId).populate('role', 'name');

  if (!staff) {
    return {
      valid: false,
      status: 404,
      message: 'Staff member not found'
    };
  }

  const roleName = String(staff.role?.name || '').toLowerCase();
  const allowedRoles = ['admin', 'doctor', 'nurse', 'caretaker'];

  if (!allowedRoles.includes(roleName)) {
    return {
      valid: false,
      status: 400,
      message: 'The selected user is not a valid staff member'
    };
  }

  return {
    valid: true,
    staff
  };
}

// Create roster shift
exports.createRoster = async (req, res) => {
  try {
    const {
      shiftId,
      location,
      room,
      description,
      generalNotes,
      date,
      startTime,
      endTime,
      assignedStaffId
    } = req.body;

    if (
      !shiftId ||
      !location ||
      !room ||
      !description ||
      !date ||
      !startTime ||
      !endTime ||
      !assignedStaffId
    ) {
      return res.status(400).json({
        message: 'Missing required fields'
      });
    }

    const existingShift = await Roster.findOne({ shiftId });

    if (existingShift) {
      return res.status(409).json({
        message: 'Shift ID already exists'
      });
    }

    const staffCheck = await validateStaff(assignedStaffId);

    if (!staffCheck.valid) {
      return res.status(staffCheck.status).json({
        message: staffCheck.message
      });
    }

    const roster = new Roster({
      shiftId,
      location,
      room,
      description,
      generalNotes: generalNotes || '',
      date,
      startTime,
      endTime,
      assignedStaff: assignedStaffId,
      createdBy: req.user._id
    });

    await roster.save();
    await roster.populate(staffPopulation);

    return res.status(201).json({
      message: 'Roster shift created successfully',
      roster
    });
  } catch (error) {
    return res.status(500).json({
      message: 'Error creating roster shift',
      details: error.message
    });
  }
};

// Get roster shifts
exports.getRosters = async (req, res) => {
  try {
    const {
      date,
      assignedStaffId,
      location,
      page = '1',
      limit = '20'
    } = req.query;

    const query = {};

    // Normal staff members only see their own shifts
    if (req.userRole !== 'admin') {
      query.assignedStaff = req.user._id;
    } else if (assignedStaffId) {
      query.assignedStaff = assignedStaffId;
    }

    if (date) {
      query.date = date;
    }

    if (location) {
      query.location = {
        $regex: location,
        $options: 'i'
      };
    }

    const pageNumber = Math.max(parseInt(page, 10) || 1, 1);
    const limitNumber = Math.min(
      Math.max(parseInt(limit, 10) || 20, 1),
      100
    );

    const skip = (pageNumber - 1) * limitNumber;

    const [items, total] = await Promise.all([
      Roster.find(query)
        .populate(staffPopulation)
        .populate('createdBy', 'fullname email')
        .sort({ date: 1, startTime: 1 })
        .skip(skip)
        .limit(limitNumber),

      Roster.countDocuments(query)
    ]);

    return res.status(200).json({
      page: pageNumber,
      limit: limitNumber,
      total,
      totalPages: Math.ceil(total / limitNumber),
      items
    });
  } catch (error) {
    return res.status(500).json({
      message: 'Error fetching roster shifts',
      details: error.message
    });
  }
};

// Get one shift
exports.getRosterByShiftId = async (req, res) => {
  try {
    const roster = await Roster.findOne({
      shiftId: req.params.shiftId
    }).populate(staffPopulation);

    if (!roster) {
      return res.status(404).json({
        message: 'Roster shift not found'
      });
    }

    const isAssignedStaff =
      String(roster.assignedStaff._id) === String(req.user._id);

    if (req.userRole !== 'admin' && !isAssignedStaff) {
      return res.status(403).json({
        message: 'You cannot view this roster shift'
      });
    }

    return res.status(200).json(roster);
  } catch (error) {
    return res.status(500).json({
      message: 'Error fetching roster shift',
      details: error.message
    });
  }
};

// Update shift
exports.updateRoster = async (req, res) => {
  try {
    const {
      location,
      room,
      description,
      generalNotes,
      date,
      startTime,
      endTime,
      assignedStaffId
    } = req.body;

    const roster = await Roster.findOne({
      shiftId: req.params.shiftId
    });

    if (!roster) {
      return res.status(404).json({
        message: 'Roster shift not found'
      });
    }

    if (assignedStaffId !== undefined) {
      const staffCheck = await validateStaff(assignedStaffId);

      if (!staffCheck.valid) {
        return res.status(staffCheck.status).json({
          message: staffCheck.message
        });
      }

      roster.assignedStaff = assignedStaffId;
    }

    if (location !== undefined) roster.location = location;
    if (room !== undefined) roster.room = room;
    if (description !== undefined) roster.description = description;
    if (generalNotes !== undefined) roster.generalNotes = generalNotes;
    if (date !== undefined) roster.date = date;
    if (startTime !== undefined) roster.startTime = startTime;
    if (endTime !== undefined) roster.endTime = endTime;

    await roster.save();
    await roster.populate(staffPopulation);

    return res.status(200).json({
      message: 'Roster shift updated successfully',
      roster
    });
  } catch (error) {
    return res.status(500).json({
      message: 'Error updating roster shift',
      details: error.message
    });
  }
};

// Delete shift
exports.deleteRoster = async (req, res) => {
  try {
    const roster = await Roster.findOneAndDelete({
      shiftId: req.params.shiftId
    });

    if (!roster) {
      return res.status(404).json({
        message: 'Roster shift not found'
      });
    }

    return res.status(200).json({
      message: 'Roster shift deleted successfully'
    });
  } catch (error) {
    return res.status(500).json({
      message: 'Error deleting roster shift',
      details: error.message
    });
  }
};

// Staff clock on
exports.clockOn = async (req, res) => {
  try {
    const roster = await Roster.findOne({
      shiftId: req.params.shiftId
    });

    if (!roster) {
      return res.status(404).json({
        message: 'Roster shift not found'
      });
    }

    if (String(roster.assignedStaff) !== String(req.user._id)) {
      return res.status(403).json({
        message: 'You are not assigned to this shift'
      });
    }

    if (roster.clockOnTime) {
      return res.status(400).json({
        message: 'You have already clocked on'
      });
    }

    roster.clockOnTime = new Date();
    await roster.save();
    await roster.populate(staffPopulation);

    return res.status(200).json({
      message: 'Clocked on successfully',
      roster
    });
  } catch (error) {
    return res.status(500).json({
      message: 'Error clocking on',
      details: error.message
    });
  }
};

// Staff clock off
exports.clockOff = async (req, res) => {
  try {
    const roster = await Roster.findOne({
      shiftId: req.params.shiftId
    });

    if (!roster) {
      return res.status(404).json({
        message: 'Roster shift not found'
      });
    }

    if (String(roster.assignedStaff) !== String(req.user._id)) {
      return res.status(403).json({
        message: 'You are not assigned to this shift'
      });
    }

    if (!roster.clockOnTime) {
      return res.status(400).json({
        message: 'You must clock on first'
      });
    }

    if (roster.clockOffTime) {
      return res.status(400).json({
        message: 'You have already clocked off'
      });
    }

    roster.clockOffTime = new Date();
    await roster.save();
    await roster.populate(staffPopulation);

    return res.status(200).json({
      message: 'Clocked off successfully',
      roster
    });
  } catch (error) {
    return res.status(500).json({
      message: 'Error clocking off',
      details: error.message
    });
  }
};