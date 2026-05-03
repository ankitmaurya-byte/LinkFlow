import express from 'express';
import { User } from '../models/user.js';
import { Friendship } from '../models/friendship.js';
import { requireAuth } from '../middleware/auth.js';
import mongoose from 'mongoose';

export const router = express.Router();
router.use(requireAuth);

router.get('/search', async (req, res, next) => {
  try {
    const q = (req.query.q || '').toString().trim().toLowerCase();
    let users;
    if (!q) {
      // Empty query: return up to 20 users (friends prioritized, then others).
      const me = new mongoose.Types.ObjectId(req.user.id);
      const friendships = await Friendship.find({
        $or: [{ userA: me }, { userB: me }],
        status: 'accepted'
      }).limit(20);
      const friendIds = friendships
        .map(f => f.userA.equals(me) ? f.userB : f.userA);
      const friendUsers = friendIds.length
        ? await User.find({ _id: { $in: friendIds } }).limit(20).select('username')
        : [];
      let extras = [];
      if (friendUsers.length < 20) {
        extras = await User.find({
          _id: { $nin: [me, ...friendIds] }
        }).limit(20 - friendUsers.length).select('username');
      }
      users = [...friendUsers, ...extras];
    } else {
      users = await User.find({
        username: { $regex: '^' + q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' },
        _id: { $ne: req.user.id }
      }).limit(20).select('username');
    }

    const me = new mongoose.Types.ObjectId(req.user.id);
    const ids = users.map(u => u._id);
    const friendships = await Friendship.find({
      $or: ids.map(id => Friendship.normalizePair(me, id))
    });
    const fByPairKey = new Map();
    for (const f of friendships) {
      const key = [f.userA.toString(), f.userB.toString()].sort().join('|');
      fByPairKey.set(key, f);
    }
    res.json({
      users: users.map(u => {
        const key = [me.toString(), u._id.toString()].sort().join('|');
        const f = fByPairKey.get(key);
        let status = 'none';
        if (f) {
          if (f.status === 'accepted') status = 'friend';
          else if (f.status === 'pending') {
            status = f.requesterId.equals(me) ? 'requested' : 'incoming';
          }
        }
        return { id: u._id.toString(), username: u.username, status };
      })
    });
  } catch (e) { next(e); }
});
