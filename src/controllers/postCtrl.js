import Comment from '../models/Comment.js';
import Post from '../models/Post.js';
import User from '../models/User.js';
import { errorMessages } from '../utils/constants.js';
import { getPostResponse } from '../utils/mongoose.js';

const generateFilter = ({ search, username, hashtag }) => {
  if (search)
    return {
      slug: {
        $regex: new RegExp(search),
        $options: 'i',
      },
    };
  if (username) return { 'author.username': username };
  if (hashtag) return { hashtags: hashtag };
  return {};
};

async function getAll(req, res) {
  try {
    const { search, username, hashtag, ...params } = req.query;

    const filter = generateFilter({ search, username, hashtag });
    const postResponse = await getPostResponse(filter, params);

    res.send(postResponse);
  } catch (error) {
    res.status(500).send(error);
  }
}

async function getBySlug(req, res) {
  try {
    const { slug } = req.params;

    const post = await Post.findOne({ slug }).lean();
    if (!post) {
      return res.status(404).send({
        name: 'postNotFound',
        message: errorMessages['postNotFound'],
      });
    }

    const commentCount = await Comment.countDocuments({ postId: post._id });
    const postResponse = {
      ...post,
      statistics: {
        ...post.statistics,
        commentCount,
      },
    };

    await Post.findByIdAndUpdate(post._id, { $inc: { 'statistics.viewCount': 1 } });

    res.send(postResponse);
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
        message: errorMessages['postNotFound'],
      });
    }

    if (user.role !== 'admin' && !post.authorId.equals(user._id)) {
      return res.status(403).send({
        name: 'notAllowedEditPost',
        message: errorMessages['notAllowedEditPost'],
      });
    }

    res.send(post);
  } catch (error) {
    res.status(500).send(error);
  }
}

async function getMyList(req, res) {
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

async function getSaved(req, res) {
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
    const { _id, name, avatar, username, bio } = req.user;

    const newPost = new Post({
      ...formData,
      author: {
        _id,
        name,
        avatar,
        username,
        bio,
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
        message: errorMessages['postNotFound'],
      });
    }

    if (user.role !== 'admin' && !post.authorId.equals(user._id)) {
      return res.status(403).send({
        name: 'notAllowedEditPost',
        message: errorMessages['notAllowedEditPost'],
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
        message: errorMessages['postNotFound'],
      });
    }

    if (user.role !== 'admin' && !post.authorId.equals(user._id)) {
      return res.status(403).send({
        name: 'notAllowedDeletePost',
        message: errorMessages['notAllowedDeletePost'],
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
        message: errorMessages['postNotFound'],
      });
    }

    const isLiked = post.likes.some((id) => id.equals(userId));
    const update = isLiked
      ? { $pull: { likes: userId }, $inc: { 'statistics.likeCount': -1 } }
      : { $push: { likes: userId }, $inc: { 'statistics.likeCount': 1 } };

    const updatedPost = await Post.findByIdAndUpdate(postId, update, {
      new: true,
    }).lean();

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
        message: errorMessages['postNotFound'],
      });
    }

    if (user.saved.includes(postId)) {
      return res.status(400).send({
        name: 'postSaved',
        message: errorMessages['postSaved'],
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
        message: errorMessages['postNotFound'],
      });
    }

    if (!user.saved.includes(postId)) {
      return res.status(400).send({
        name: 'postNotSaved',
        message: errorMessages['postNotSaved'],
      });
    }

    await User.updateOne({ _id: user._id }, { $pull: { saved: postId } });

    res.sendStatus(200);
  } catch (error) {
    res.status(500).send(error);
  }
}

async function search(req, res) {
  try {
    const { searchFor, searchTerm } = req.query;

    const filter = generateFilter({ [searchFor]: searchTerm });

    const postList = await Post.find(filter).sort({ createdAt: -1 }).lean();

    return res.send(postList);
  } catch (error) {
    res.status(500).send(error);
  }
}

const postCtrl = {
  getAll,
  getBySlug,
  getForEdit,
  getMyList,
  getSaved,
  create,
  update,
  remove,
  like,
  save,
  unsave,
  search,
};

export default postCtrl;
