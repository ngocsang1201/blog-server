import Post from '../models/Post.js';
import User from '../models/User.js';
import Comment from '../models/Comment.js';
import { getPostResponse } from '../utils/mongoose.js';

const getAll = async (req, res) => {
	try {
		const params = req.query;

		const getFilter = ({ tag, username }) => {
			if (tag && username)
				return { 'tags.value': tag, 'author.username': username };
			if (tag) return { 'tags.value': tag };
			if (username) return { 'author.username': username };

			return {};
		};

		const filter = getFilter(params);
		const postResponse = await getPostResponse(filter, params);

		res.send(postResponse);
	} catch (error) {
		res.status(400).send(error);
	}
};

const getMyPosts = async (req, res) => {
	try {
		const params = req.query;

		if (!req.user)
			return res.status(400).send({ message: 'Invalid Authentication.' });

		const user = req.user;

		const filter = { authorId: user._id };
		const postResponse = await getPostResponse(filter, params);

		res.send(postResponse);
	} catch (error) {
		res.status(400).send(error);
	}
};

const getBySlug = async (req, res) => {
	try {
		const { postSlug } = req.params;

		const post = await Post.findOne({ slug: postSlug }).lean();
		if (!post) return res.status(404).send({ message: 'Post not found' });

		res.send(post);
	} catch (error) {
		res.status(400).send(error);
	}
};

const getPostForEdit = async (req, res) => {
	try {
		const { postId } = req.params;

		if (!req.user)
			return res.status(400).send({ message: 'Invalid Authentication.' });

		const user = req.user;

		const post = await Post.findById(postId).lean();
		if (!post) return res.status(404).send({ message: 'Post not found' });

		res.send(post);
	} catch (error) {
		res.status(400).send(error);
	}
};

const createPost = async (req, res) => {
	try {
		const formData = req.body;

		if (!req.user)
			return res.status(400).send({ message: 'Invalid Authentication.' });

		const { _id, name, avatar } = req.user;

		const newPost = new Post({
			...formData,
			author: {
				_id,
				name,
				avatar,
			},
		});

		const savedPost = await newPost.save();

		res.send(savedPost?._doc);
	} catch (error) {
		res.status(400).send(error);
	}
};

const updatePost = async (req, res) => {
	try {
		const { postId } = req.params;
		const formData = req.body;

		if (!req.user)
			return res.status(400).send({ message: 'Invalid Authentication.' });

		const user = req.user;

		if (user.role !== 'admin' && formData.authorId !== `${user._id}`)
			return res.status(400).send('You are not authorized to edit this post');

		const updatedPost = await Post.findByIdAndUpdate(
			postId,
			{ $set: formData },
			{ new: true }
		);

		res.send(updatedPost);
	} catch (error) {
		res.status(400).send(error);
	}
};

const removePost = async (req, res) => {
	try {
		const { postId } = req.params;

		if (!req.user)
			return res.status(400).send({ message: 'Invalid Authentication.' });

		const user = req.user;

		const post = await Post.findById(postId).lean();
		if (!post) return res.status(404).send({ message: 'Post not found' });

		if (user.role !== 'admin' && post.authorId !== `${user._id}`)
			return res.status(400).send('You are not authorized to delete this post');

		await Post.deleteOne({ _id: postId });
		await Comment.deleteMany({ postId });
		await User.updateMany(
			{ saved: { $in: [postId] } },
			{ $pull: { saved: postId } }
		);

		res.send({ message: 'Post deleted' });
	} catch (error) {
		res.status(400).send(error);
	}
};

const likePost = async (req, res) => {
	try {
		const { postSlug } = req.params;

		if (!req.user)
			return res.status(400).send({ message: 'Invalid Authentication.' });

		const user = req.user;

		const post = await Post.findOne({ slug: postSlug });
		if (!post) return res.status(404).send({ message: 'Post not found' });

		const hasLiked = post.likes.includes(user._id);

		const update = hasLiked
			? { $pull: { likes: user._id } }
			: { $push: { likes: user._id } };

		const updatedPost = await Post.findOneAndUpdate(
			{ slug: postSlug },
			update,
			{ new: true }
		).lean();

		res.send(updatedPost);
	} catch (error) {
		res.status(400).send(error);
	}
};

const getSavedPostList = async (req, res) => {
	try {
		const params = req.query;

		if (!req.user)
			return res.status(400).send({ message: 'Invalid Authentication.' });

		const { saved } = req.user;

		const filter = { _id: { $in: saved } };
		const postResponse = await getPostResponse(filter, params);

		res.send(postResponse);
	} catch (error) {
		res.status(400).send(error);
	}
};

const savePost = async (req, res) => {
	try {
		const { postId } = req.params;

		if (!req.user)
			return res.status(400).send({ message: 'Invalid Authentication.' });

		const user = req.user;

		const post = await Post.findById(postId).lean();
		if (!post) return res.status(404).send({ message: 'Post not found' });

		if (user.saved.includes(postId)) {
			return res.status(400).send({ message: 'Bài viết đã được lưu' });
		}

		await User.updateOne({ _id: user._id }, { $push: { saved: postId } });

		res.send({ message: 'Successfully' });
	} catch (error) {
		res.status(400).send(error);
	}
};

const unSavePost = async (req, res) => {
	try {
		const { postId } = req.params;

		if (!req.user)
			return res.status(400).send({ message: 'Invalid Authentication.' });

		const user = req.user;

		const post = await Post.findById(postId).lean();
		if (!post) return res.status(404).send({ message: 'Post not found' });

		const indexOfPostId = user.saved.findIndex((id) => id === postId);
		if (indexOfPostId < 0)
			return res.status(400).send({ message: 'Bài viết chưa được lưu' });

		const savedPosts = user?.saved;
		savedPosts.splice(indexOfPostId, 1);

		await User.updateOne(
			{ _id: user._id },
			{
				$set: { saved: savedPosts },
			},
			{ new: true }
		);

		res.send({ message: 'Successfully' });
	} catch (error) {
		res.status(400).send(error);
	}
};

const searchPosts = async (req, res) => {
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
		console.log(error);
		res.status(400).send(error);
	}
};

const authCtrl = {
	getAll,
	getMyPosts,
	getBySlug,
	getPostForEdit,
	createPost,
	updatePost,
	removePost,
	likePost,
	getSavedPostList,
	savePost,
	unSavePost,
	searchPosts,
};

export default authCtrl;