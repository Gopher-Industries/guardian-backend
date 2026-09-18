const mongoose = require('mongoose');
const Message = require('../models/Message');
const User = require('../models/User');
const Organization = require('../models/Organization');
const Role = require('../models/Role');

const {
  emitMessageToUser
} = require('../../messageSocket');

const allowedRoles = [
  'admin',
  'doctor',
  'nurse',
  'caretaker'
];

const getUserWithRole = async (userId) => {
  return User.findById(userId)
    .populate('role', 'name')
    .select('fullname role organization');
};

const getFirstName = (fullname) => {
  if (!fullname) return '';

  return String(fullname)
    .trim()
    .split(/\s+/)[0];
};


/*
 * Get all active organizations
 * the user belongs to.
 */
const getUserOrganizations = async (user) => {
  const organizationLinks = [
    {
      createdBy: user._id
    },
    {
      staff: user._id
    }
  ];

  if (user.organization) {
    organizationLinks.push({
      _id: user.organization
    });
  }

  return Organization.find({
    active: {
      $ne: false
    },

    $or:
      organizationLinks
  }).select(
    '_id createdBy staff'
  );
};


/*
 * Find organizations shared
 * by two users.
 */
const getSharedOrganizations = async (
  firstUser,
  secondUser
) => {
  const [
    firstOrganizations,
    secondOrganizations
  ] = await Promise.all([
    getUserOrganizations(
      firstUser
    ),

    getUserOrganizations(
      secondUser
    )
  ]);

  if (
    firstOrganizations.length === 0 ||
    secondOrganizations.length === 0
  ) {
    return {
      error:
        'Unable to determine user organization.',

      statusCode: 400
    };
  }

  const secondOrganizationIds =
    new Set(
      secondOrganizations.map(
        organization =>
          String(
            organization._id
          )
      )
    );

  const sharedOrganizations =
    firstOrganizations.filter(
      organization =>
        secondOrganizationIds.has(
          String(
            organization._id
          )
        )
    );

  if (
    sharedOrganizations.length === 0
  ) {
    return {
      error:
        'Messages can only be accessed between users who share an organization.',

      statusCode: 403
    };
  }

  return {
    organizations:
      sharedOrganizations,

    organizationIds:
      sharedOrganizations.map(
        organization =>
          organization._id
      )
  };
};


/*
 * Message stores one organization.
 * If users share more than one,
 * prefer a direct organization link.
 */
const pickMessageOrganization = (
  sharedOrganizations,
  sender,
  recipient
) => {
  const sharedIds =
    new Set(
      sharedOrganizations.map(
        organization =>
          String(
            organization._id
          )
      )
    );

  if (
    sender.organization &&
    sharedIds.has(
      String(
        sender.organization
      )
    )
  ) {
    return sender.organization;
  }

  if (
    recipient.organization &&
    sharedIds.has(
      String(
        recipient.organization
      )
    )
  ) {
    return recipient.organization;
  }

  return sharedOrganizations[0]._id;
};


/**
 * SEND PRIVATE MESSAGE
 */
exports.sendMessage = async (req, res) => {
  try {
    const senderId =
      req.user._id;

    const {
      recipientId,
      message
    } = req.body;

    if (
      !mongoose.isValidObjectId(
        recipientId
      )
    ) {
      return res.status(400).json({
        error:
          'Recipient ID is invalid.'
      });
    }

    if (
      !message ||
      !String(message).trim()
    ) {
      return res.status(400).json({
        error:
          'Message cannot be empty.'
      });
    }

    const cleanMessage =
      String(message).trim();

    if (
      cleanMessage.length > 5000
    ) {
      return res.status(400).json({
        error:
          'Message cannot exceed 5000 characters.'
      });
    }

    if (
      String(senderId) ===
      String(recipientId)
    ) {
      return res.status(400).json({
        error:
          'You cannot send a message to yourself.'
      });
    }

    const [
      sender,
      recipient
    ] = await Promise.all([
      getUserWithRole(
        senderId
      ),

      getUserWithRole(
        recipientId
      )
    ]);

    if (!sender) {
      return res.status(404).json({
        error:
          'Sender not found.'
      });
    }

    if (!recipient) {
      return res.status(404).json({
        error:
          'Recipient not found.'
      });
    }

    const recipientRole =
      recipient.role
        ?.name
        ?.toLowerCase();

    if (
      !allowedRoles.includes(
        recipientRole
      )
    ) {
      return res.status(403).json({
        error:
          'Messages can only be sent to admin, doctor, nurse, or caretaker users.'
      });
    }

    const organizationCheck =
      await getSharedOrganizations(
        sender,
        recipient
      );

    if (
      organizationCheck.error
    ) {
      return res
        .status(
          organizationCheck
            .statusCode
        )
        .json({
          error:
            organizationCheck.error
        });
    }

    const messageOrganization =
      pickMessageOrganization(
        organizationCheck
          .organizations,

        sender,
        recipient
      );

    const newMessage =
      await Message.create({
        sender:
          senderId,

        recipient:
          recipientId,

        organization:
          messageOrganization,

        message:
          cleanMessage
      });

    const savedMessage =
      await Message.findById(
        newMessage._id
      )
        .populate({
          path:
            'sender',

          select:
            'fullname role',

          populate: {
            path:
              'role',

            select:
              'name'
          }
        })
        .populate({
          path:
            'recipient',

          select:
            'fullname role',

          populate: {
            path:
              'role',

            select:
              'name'
          }
        });

    const socketPayload =
      savedMessage.toObject();

    setImmediate(() => {
      try {
        emitMessageToUser(
          recipientId,
          'newMessage',
          socketPayload
        );
      } catch (
        socketError
      ) {
        console.error(
          'Live message delivery failed:',
          socketError.message
        );
      }
    });

    return res
      .status(201)
      .json({
        message:
          'Message sent successfully.',

        data:
          savedMessage
      });

  } catch (error) {
    return res
      .status(500)
      .json({
        error:
          error.message
      });
  }
};


/**
 * GET MY CONVERSATIONS
 */
exports.getConversations =
  async (req, res) => {
    try {
      const userId =
        req.user._id;

      const page =
        Math.max(
          parseInt(
            req.query.page,
            10
          ) || 1,

          1
        );

      const limit =
        Math.min(
          Math.max(
            parseInt(
              req.query.limit,
              10
            ) || 20,

            1
          ),

          100
        );

      const user =
        await getUserWithRole(
          userId
        );

      if (!user) {
        return res
          .status(404)
          .json({
            error:
              'User not found.'
          });
      }

      const organizations =
        await getUserOrganizations(
          user
        );

      if (
        organizations.length === 0
      ) {
        return res
          .status(400)
          .json({
            error:
              'Unable to determine user organization.'
          });
      }

      const currentUserId =
        new mongoose.Types.ObjectId(
          String(userId)
        );

      const organizationIds =
        organizations.map(
          organization =>
            new mongoose.Types.ObjectId(
              String(
                organization._id
              )
            )
        );

      const result =
        await Message.aggregate([
          {
            $match: {
              organization: {
                $in:
                  organizationIds
              },

              $or: [
                {
                  sender:
                    currentUserId
                },

                {
                  recipient:
                    currentUserId
                }
              ]
            }
          },

          {
            $sort: {
              created_at:
                -1
            }
          },

          {
            $addFields: {
              otherUser: {
                $cond: [
                  {
                    $eq: [
                      '$sender',
                      currentUserId
                    ]
                  },

                  '$recipient',
                  '$sender'
                ]
              }
            }
          },

          {
            $group: {
              _id:
                '$otherUser',

              latestMessage: {
                $first:
                  '$message'
              },

              latestMessageAt: {
                $first:
                  '$created_at'
              },

              latestSender: {
                $first:
                  '$sender'
              },

              unreadCount: {
                $sum: {
                  $cond: [
                    {
                      $and: [
                        {
                          $eq: [
                            '$recipient',
                            currentUserId
                          ]
                        },

                        {
                          $eq: [
                            '$read_at',
                            null
                          ]
                        }
                      ]
                    },

                    1,
                    0
                  ]
                }
              }
            }
          },

          {
            $sort: {
              latestMessageAt:
                -1
            }
          },

          {
            $facet: {
              metadata: [
                {
                  $count:
                    'total'
                }
              ],

              data: [
                {
                  $skip:
                    (page - 1) *
                    limit
                },

                {
                  $limit:
                    limit
                }
              ]
            }
          }
        ]);

      const conversations =
        result[0]?.data ||
        [];

      const total =
        result[0]
          ?.metadata?.[0]
          ?.total ||
        0;

      const userIds =
        conversations.map(
          conversation =>
            conversation._id
        );

      const users =
        await User.find({
          _id: {
            $in:
              userIds
          }
        })
          .populate(
            'role',
            'name'
          )
          .select(
            'fullname role'
          );

      const userMap =
        new Map(
          users.map(
            otherUser => [
              String(
                otherUser._id
              ),

              otherUser
            ]
          )
        );

      const data =
        conversations.map(
          conversation => {
            const otherUser =
              userMap.get(
                String(
                  conversation._id
                )
              );

            return {
              userId:
                conversation._id,

              firstName:
                getFirstName(
                  otherUser
                    ?.fullname
                ),

              fullname:
                otherUser
                  ?.fullname ||
                '',

              role:
                otherUser
                  ?.role
                  ?.name ||
                '',

              latestMessage:
                conversation
                  .latestMessage,

              latestMessageAt:
                conversation
                  .latestMessageAt,

              sentByMe:
                String(
                  conversation
                    .latestSender
                ) ===
                String(userId),

              unreadCount:
                conversation
                  .unreadCount
            };
          }
        );

      return res
        .status(200)
        .json({
          page,
          limit,
          total,

          totalPages:
            Math.ceil(
              total /
              limit
            ),

          data
        });

    } catch (error) {
      return res
        .status(500)
        .json({
          error:
            error.message
        });
    }
  };


/**
 * GET PRIVATE CONVERSATION
 */
exports.getConversation =
  async (req, res) => {
    try {
      const userId =
        req.user._id;

      const {
        userId:
          otherUserId
      } = req.params;

      if (
        !mongoose.isValidObjectId(
          otherUserId
        )
      ) {
        return res
          .status(400)
          .json({
            error:
              'User ID is invalid.'
          });
      }

      if (
        String(userId) ===
        String(otherUserId)
      ) {
        return res
          .status(400)
          .json({
            error:
              'You cannot open a conversation with yourself.'
          });
      }

      const page =
        Math.max(
          parseInt(
            req.query.page,
            10
          ) || 1,

          1
        );

      const limit =
        Math.min(
          Math.max(
            parseInt(
              req.query.limit,
              10
            ) || 30,

            1
          ),

          100
        );

      const [
        currentUser,
        otherUser
      ] = await Promise.all([
        getUserWithRole(
          userId
        ),

        getUserWithRole(
          otherUserId
        )
      ]);

      if (!currentUser) {
        return res
          .status(404)
          .json({
            error:
              'Logged-in user not found.'
          });
      }

      if (!otherUser) {
        return res
          .status(404)
          .json({
            error:
              'User not found.'
          });
      }

      const organizationCheck =
        await getSharedOrganizations(
          currentUser,
          otherUser
        );

      if (
        organizationCheck.error
      ) {
        return res
          .status(
            organizationCheck
              .statusCode
          )
          .json({
            error:
              organizationCheck
                .error
          });
      }

      const filter = {
        organization: {
          $in:
            organizationCheck
              .organizationIds
        },

        $or: [
          {
            sender:
              userId,

            recipient:
              otherUserId
          },

          {
            sender:
              otherUserId,

            recipient:
              userId
          }
        ]
      };

      const [
        total,
        foundMessages
      ] = await Promise.all([
        Message.countDocuments(
          filter
        ),

        Message.find(
          filter
        )
          .sort({
            created_at:
              -1
          })
          .skip(
            (page - 1) *
            limit
          )
          .limit(
            limit
          )
          .populate({
            path:
              'sender',

            select:
              'fullname role',

            populate: {
              path:
                'role',

              select:
                'name'
            }
          })
          .populate({
            path:
              'recipient',

            select:
              'fullname role',

            populate: {
              path:
                'role',

              select:
                'name'
            }
          })
          .lean()
      ]);

      const messages =
        foundMessages
          .reverse();

      const data =
        messages.map(
          messageItem => ({
            _id:
              messageItem._id,

            sender: {
              userId:
                messageItem
                  .sender?._id,

              firstName:
                getFirstName(
                  messageItem
                    .sender
                    ?.fullname
                ),

              fullname:
                messageItem
                  .sender
                  ?.fullname ||
                '',

              role:
                messageItem
                  .sender
                  ?.role
                  ?.name ||
                ''
            },

            recipient: {
              userId:
                messageItem
                  .recipient?._id,

              firstName:
                getFirstName(
                  messageItem
                    .recipient
                    ?.fullname
                ),

              fullname:
                messageItem
                  .recipient
                  ?.fullname ||
                '',

              role:
                messageItem
                  .recipient
                  ?.role
                  ?.name ||
                ''
            },

            message:
              messageItem
                .message,

            sentByMe:
              String(
                messageItem
                  .sender?._id
              ) ===
              String(userId),

            createdAt:
              messageItem
                .created_at,

            readAt:
              messageItem
                .read_at
          })
        );

      return res
        .status(200)
        .json({
          with: {
            userId:
              otherUser._id,

            firstName:
              getFirstName(
                otherUser
                  .fullname
              ),

            fullname:
              otherUser
                .fullname,

            role:
              otherUser
                .role
                ?.name ||
              ''
          },

          page,
          limit,
          total,

          totalPages:
            Math.ceil(
              total /
              limit
            ),

          data
        });

    } catch (error) {
      return res
        .status(500)
        .json({
          error:
            error.message
        });
    }
  };


/**
 * MARK CONVERSATION AS READ
 */
exports.markConversationAsRead =
  async (req, res) => {
    try {
      const userId =
        req.user._id;

      const {
        userId:
          otherUserId
      } = req.params;

      if (
        !mongoose.isValidObjectId(
          otherUserId
        )
      ) {
        return res
          .status(400)
          .json({
            error:
              'User ID is invalid.'
          });
      }

      if (
        String(userId) ===
        String(otherUserId)
      ) {
        return res
          .status(400)
          .json({
            error:
              'You cannot mark your own conversation as read.'
          });
      }

      const [
        currentUser,
        otherUser
      ] = await Promise.all([
        getUserWithRole(
          userId
        ),

        getUserWithRole(
          otherUserId
        )
      ]);

      if (!currentUser) {
        return res
          .status(404)
          .json({
            error:
              'Logged-in user not found.'
          });
      }

      if (!otherUser) {
        return res
          .status(404)
          .json({
            error:
              'User not found.'
          });
      }

      const organizationCheck =
        await getSharedOrganizations(
          currentUser,
          otherUser
        );

      if (
        organizationCheck.error
      ) {
        return res
          .status(
            organizationCheck
              .statusCode
          )
          .json({
            error:
              organizationCheck
                .error
          });
      }

      const readTime =
        new Date();

      const result =
        await Message.updateMany(
          {
            organization: {
              $in:
                organizationCheck
                  .organizationIds
            },

            sender:
              otherUserId,

            recipient:
              userId,

            read_at:
              null
          },

          {
            $set: {
              read_at:
                readTime,

              updated_at:
                readTime
            }
          }
        );

      return res
        .status(200)
        .json({
          message:
            'Conversation marked as read.',

          updatedMessages:
            result.modifiedCount,

          readAt:
            readTime
        });

    } catch (error) {
      return res
        .status(500)
        .json({
          error:
            error.message
        });
    }
  };


/**
 * FIND USERS FOR MESSAGING
 *
 * role = filter
 * name = alphabetical starting point
 */
exports.searchMessageUsers =
  async (req, res) => {
    try {
      const currentUserId =
        req.user._id;

      const roleFilter =
        req.query.role
          ? String(
              req.query.role
            )
              .trim()
              .toLowerCase()
          : '';

      const namePointer =
        req.query.name
          ? String(
              req.query.name
            ).trim()
          : '';

      const page =
        Math.max(
          parseInt(
            req.query.page,
            10
          ) || 1,

          1
        );

      const limit =
        Math.min(
          Math.max(
            parseInt(
              req.query.limit,
              10
            ) || 20,

            1
          ),

          100
        );

      if (
        roleFilter &&
        !allowedRoles.includes(
          roleFilter
        )
      ) {
        return res
          .status(400)
          .json({
            error:
              'Role must be admin, doctor, nurse, or caretaker.'
          });
      }

      const currentUser =
        await getUserWithRole(
          currentUserId
        );

      if (!currentUser) {
        return res
          .status(404)
          .json({
            error:
              'User not found.'
          });
      }

      const organizations =
        await getUserOrganizations(
          currentUser
        );

      if (
        organizations.length === 0
      ) {
        return res
          .status(400)
          .json({
            error:
              'Unable to determine user organization.'
          });
      }

      const roles =
        await Role.find({})
          .select(
            '_id name'
          )
          .lean();

      let usableRoles =
        roles.filter(
          role =>
            allowedRoles.includes(
              String(
                role.name
              ).toLowerCase()
            )
        );

      if (roleFilter) {
        usableRoles =
          usableRoles.filter(
            role =>
              String(
                role.name
              ).toLowerCase() ===
              roleFilter
          );
      }

      const roleIds =
        usableRoles.map(
          role =>
            role._id
        );

      if (
        roleIds.length === 0
      ) {
        return res
          .status(200)
          .json({
            page,
            limit,
            total:
              0,

            totalPages:
              0,

            data:
              []
          });
      }

      const organizationIds =
        organizations.map(
          organization =>
            organization._id
        );

      const linkedUserIds =
        organizations
          .flatMap(
            organization => [
              organization
                .createdBy,

              ...(
                organization
                  .staff ||
                []
              )
            ]
          )
          .filter(
            Boolean
          );

      const query = {
        _id: {
          $ne:
            currentUserId
        },

        role: {
          $in:
            roleIds
        },

        $or: [
          {
            organization: {
              $in:
                organizationIds
            }
          },

          {
            _id: {
              $in:
                linkedUserIds
            }
          }
        ]
      };


      /*
       * Name is an alphabetical pointer.
       *
       * name=aa means:
       * start from "aa"
       * and continue alphabetically.
       */
      if (namePointer) {
        query.fullname = {
          $gte:
            namePointer
        };
      }


      const [
        total,
        users
      ] = await Promise.all([
        User.countDocuments(
          query
        )
          .collation({
            locale:
              'en',

            strength:
              2
          }),

        User.find(
          query
        )
          .populate(
            'role',
            'name'
          )
          .select(
            'fullname role'
          )
          .collation({
            locale:
              'en',

            strength:
              2
          })
          .sort({
            fullname:
              1
          })
          .skip(
            (page - 1) *
            limit
          )
          .limit(
            limit
          )
          .lean()
      ]);

      const data =
        users.map(
          user => ({
            userId:
              user._id,

            firstName:
              getFirstName(
                user.fullname
              ),

            fullname:
              user.fullname,

            role:
              user.role
                ?.name ||
              ''
          })
        );

      return res
        .status(200)
        .json({
          page,
          limit,
          total,

          totalPages:
            Math.ceil(
              total /
              limit
            ),

          data
        });

    } catch (error) {
      return res
        .status(500)
        .json({
          error:
            error.message
        });
    }
  };