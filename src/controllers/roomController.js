const Room = require('../models/Room');

// Create a new room
exports.createRoom = async (req, res) => {
  try {
    const {
      location,
      roomNo,
      floor,
      wing
    } = req.body;

    const room = new Room({
      location,
      roomNo,
      floor,
      wing
    });

    await room.save();

    res.status(201).json({
      message: 'Room created successfully',
      room
    });

  } catch (error) {
    res.status(400).json({
      error: error.message
    });
  }
};


// Get all rooms
exports.getAllRooms = async (req, res) => {
  try {
    const rooms = await Room.find();

    res.status(200).json(rooms);

  } catch (error) {
    res.status(400).json({
      error: error.message
    });
  }
};


// Get one room by ID
exports.getRoomById = async (req, res) => {
  try {
    const room = await Room.findById(req.params.id);

    if (!room) {
      return res.status(404).json({
        error: 'Room not found'
      });
    }

    res.status(200).json(room);

  } catch (error) {
    res.status(400).json({
      error: error.message
    });
  }
};


// Update room
exports.updateRoom = async (req, res) => {
  try {
    const room = await Room.findByIdAndUpdate(
      req.params.id,
      req.body,
      {
        new: true,
        runValidators: true
      }
    );

    if (!room) {
      return res.status(404).json({
        error: 'Room not found'
      });
    }

    res.status(200).json({
      message: 'Room updated successfully',
      room
    });

  } catch (error) {
    res.status(400).json({
      error: error.message
    });
  }
};


// Delete room
exports.deleteRoom = async (req, res) => {
  try {
    const room = await Room.findByIdAndDelete(req.params.id);

    if (!room) {
      return res.status(404).json({
        error: 'Room not found'
      });
    }

    res.status(200).json({
      message: 'Room deleted successfully'
    });

  } catch (error) {
    res.status(400).json({
      error: error.message
    });
  }
};