import Comment from '../models/Comment.js';
import Post from '../models/Post.js';
import User from '../models/User.js';
import { getPostResponse } from '../utils/mongoose.js';

async function getAll(req, res) {
  try {
    const params = req.query;

    const getFilter = ({ keyword, username }) => {
      if (keyword && username) return { 'keywords.value': keyword, 'author.username': username };
      if (keyword) return { 'keywords.value': keyword };
      if (username) return { 'author.username': username };

      return {};
    };

    const filter = getFilter(params);
    const postResponse = await getPostResponse(filter, params);

    res.send(postResponse);
  } catch (error) {
    res.status(500).send(error);
  }
}

async function getBySlug(req, res) {
  try {
    const { postSlug } = req.params;

    const post = await Post.findOne({ slug: postSlug }).lean();
    if (!post) {
      return res.status(404).send({
        name: 'postNotFound',
        message: 'Post not found.',
      });
    }

    const commentCount = await Comment.countDocuments({ postId: post._id });

    res.send({ ...post, commentCount });
  } catch (error) {
    res.status(500).send(error);
  }
}

async function getForEdit(req, res) {
  try {
    const { postId } = req.params;
    const user = req.user;

    const post = await Post.findById(postId).lean();
    if (!post) {
      return res.status(404).send({
        name: 'postNotFound',
        message: 'Post not found.',
      });
    }

    if (user.role !== 'admin' && !post.authorId.equals(user._id)) {
      return res.status(403).send({
        name: 'notAllowedEditPost',
        message: 'You are not allowed to edit this post.',
      });
    }

    res.send(post);
  } catch (error) {
    res.status(500).send(error);
  }
}

async function getMyPostList(req, res) {
  try {
    const params = req.query;
    const user = req.user;

    const filter = { authorId: user._id };
    const postResponse = await getPostResponse(filter, params);

    res.send(postResponse);
  } catch (error) {
    res.status(500).send(error);
  }
}

async function getSavedList(req, res) {
  try {
    const params = req.query;
    const { saved } = req.user;

    const filter = { _id: { $in: saved } };
    const postResponse = await getPostResponse(filter, params);

    res.send(postResponse);
  } catch (error) {
    res.status(500).send(error);
  }
}

async function create(req, res) {
  try {
    const formData = req.body;
    const { _id, fullName, avatar, username } = req.user;

    const newPost = new Post({
      ...formData,
      author: {
        _id,
        fullName,
        avatar,
        username,
      },
    });

    const savedPost = await newPost.save();

    res.send(savedPost?._doc);
  } catch (error) {
    res.status(500).send(error);
  }
}

async function update(req, res) {
  try {
    const { postId } = req.params;
    const formData = req.body;
    const user = req.user;

    const post = await Post.findById(postId).lean();
    if (!post) {
      return res.status(404).send({
        name: 'postNotFound',
        message: 'Post not found.',
      });
    }

    if (user.role !== 'admin' && !post.authorId.equals(user._id)) {
      return res.status(403).send({
        name: 'notAllowedEditPost',
        message: 'You are not allowed to edit this post.',
      });
    }

    const updatedPost = await Post.findByIdAndUpdate(
      postId,
      { $set: formData },
      { new: true }
    ).lean();

    res.send(updatedPost);
  } catch (error) {
    res.status(500).send(error);
  }
}

async function remove(req, res) {
  try {
    const { postId } = req.params;
    const user = req.user;

    const post = await Post.findById(postId).lean();
    if (!post) {
      return res.status(404).send({
        name: 'postNotFound',
        message: 'Post not found.',
      });
    }

    if (user.role !== 'admin' && !post.authorId.equals(user._id)) {
      return res.status(403).send({
        name: 'notAllowedDeletePost',
        message: 'You are not allowed to delete this post.',
      });
    }

    await Post.deleteOne({ _id: postId });
    await Comment.deleteMany({ postId });
    await User.updateMany({ saved: { $in: [postId] } }, { $pull: { saved: postId } });

    res.sendStatus(200);
  } catch (error) {
    res.status(500).send(error);
  }
}

async function like(req, res) {
  try {
    const { postId } = req.params;
    const { _id: userId } = req.user;

    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).send({
        name: 'postNotFound',
        message: 'Post not found.',
      });
    }

    const isLiked = post.likes.some((id) => id.equals(userId));
    const update = isLiked ? { $pull: { likes: userId } } : { $push: { likes: userId } };

    const updatedPost = await Post.findByIdAndUpdate(postId, update, {
      new: true,
    }).lean();

    // io.to(`${userId}`).emit('listenNoti', {
    //   notification: {
    //     message: `${req.user.name} liked your post.`,
    //   },
    // });

    res.send(updatedPost);
  } catch (error) {
    res.status(500).send(error);
  }
}

async function save(req, res) {
  try {
    const { postId } = req.params;
    const user = req.user;

    const post = await Post.findById(postId).lean();
    if (!post) {
      return res.status(404).send({
        name: 'postNotFound',
        message: 'Post not found.',
      });
    }

    if (user.saved.includes(postId)) {
      return res.status(400).send({
        name: 'postSaved',
        message: 'Post is saved.',
      });
    }

    await User.updateOne({ _id: user._id }, { $push: { saved: postId } });

    res.sendStatus(200);
  } catch (error) {
    res.status(500).send(error);
  }
}

async function unsave(req, res) {
  try {
    const { postId } = req.params;
    const user = req.user;

    const post = await Post.findById(postId).lean();
    if (!post) {
      return res.status(404).send({
        name: 'postNotFound',
        message: 'Post not found.',
      });
    }

    const indexOfPostId = user.saved.findIndex((id) => id === postId);
    if (indexOfPostId < 0) {
      return res.status(400).send({
        name: 'postNotSaved',
        message: 'Post have not saved yet.',
      });
    }

    const savedPosts = user?.saved;
    savedPosts.splice(indexOfPostId, 1);

    await User.updateOne({ _id: user._id }, { $set: { saved: savedPosts } }, { new: true });

    res.sendStatus(200);
  } catch (error) {
    res.status(500).send(error);
  }
}

async function search(req, res) {
  try {
    const { q: searchTerm } = req.query;

    const postList = await Post.find({
      slug: {
        $regex: new RegExp(searchTerm),
        $options: 'i',
      },
    }).sort({ createdAt: -1 });

    return res.send(postList);
  } catch (error) {
    res.status(500).send(error);
  }
}

const postCtrl = {
  getAll,
  getBySlug,
  getForEdit,
  getMyPostList,
  getSavedList,
  create,
  update,
  remove,
  like,
  save,
  unsave,
  search,
};

export default postCtrl;
