import { io } from '../index.js';
import Comment from '../models/Comment.js';
import Post from '../models/Post.js';
import { errorMessages } from '../utils/constants.js';

async function getByPostId(req, res) {
  try {
    const { postId } = req.query;

    const commentList = await Comment.find({ postId }).sort({ createdAt: 'desc' }).lean();

    res.send(commentList);
  } catch (error) {
    res.status(500).send(error);
  }
}

async function create(req, res) {
  try {
    const formData = req.body;
    const { postId } = formData;
    const { _id, name, avatar, username, bio } = req.user;

    const post = await Post.findById(postId).lean();
    if (!post) {
      return res.status(404).send({
        name: 'postNotFound',
        message: errorMessages['postNotFound'],
      });
    }

    const newComment = new Comment({
      ...formData,
      user: {
        _id,
        name,
        avatar,
        username,
        bio,
      },
    });
    await newComment.save();

    const commentCount = await Comment.countDocuments({ postId });
    await Post.findByIdAndUpdate(postId, { $set: { 'statistics.commentCount': commentCount } });

    io.to(`${postId}`).emit('createComment', {
      comment: newComment._doc,
    });

    res.send(newComment._doc);
  } catch (error) {
    res.status(500).send(error);
  }
}

async function remove(req, res) {
  try {
    const { commentId } = req.params;
    const user = req.user;

    const comment = await Comment.findById(commentId).lean();
    if (!comment) {
      return res.status(404).send({
        name: 'commentNotFound',
        message: errorMessages['commentNotFound'],
      });
    }

    if (user.role !== 'admin' && !comment.userId.equals(user._id)) {
      return res.status(403).send({
        name: 'notAllowedDeleteComment',
        message: errorMessages['notAllowedDeleteComment'],
      });
    }

    await Comment.deleteOne({ _id: commentId });

    const commentCount = await Comment.countDocuments({ postId: comment.postId });
    await Post.findByIdAndUpdate(postId, { $set: { 'statistics.commentCount': commentCount } });

    io.to(`${comment.postId}`).emit('removeComment', { id: comment._id });

    res.sendStatus(200);
  } catch (error) {
    res.status(500).send(error);
  }
}

async function like(req, res) {
  try {
    const { commentId } = req.params;
    const { _id: userId } = req.user;

    const comment = await Comment.findById(commentId).lean();
    if (!comment) {
      return res.status(404).send({
        name: 'commentNotFound',
        message: errorMessages['commentNotFound'],
      });
    }

    const isLiked = comment.likes.some((id) => id.equals(userId));

    const update = isLiked ? { $pull: { likes: userId } } : { $push: { likes: userId } };

    const updatedComment = await Comment.findByIdAndUpdate(commentId, update, {
      new: true,
    }).lean();

    res.send(updatedComment);
  } catch (error) {
    res.status(500).send(error);
  }
}

const commentCtrl = {
  getByPostId,
  create,
  remove,
  like,
};

export default commentCtrl;
