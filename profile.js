// profile.js - Logic for profile.html

import {
  auth, db, appId, doc, getDoc, collection, query, where, onSnapshot,
  onAuthStateChanged, authenticateUser
} from './firebase-config.js';

// --- DOM ELEMENTS ---
const profileDetailsContainer = document.getElementById('profile-details-container');
const profilePostsContainer = document.getElementById('profile-posts-container');
const headerAvatarLink = document.getElementById('user-avatar-link');

// --- UI RENDERING FUNCTIONS ---

/**
 * Renders the main profile header section.
 * @param {object} userData - The user data from Firestore.
 */
const renderProfileHeader = (userData) => {
  const userInitial = userData.username.charAt(0).toUpperCase();
  profileDetailsContainer.innerHTML = `
    <div class="profile-header-avatar">${userInitial}</div>
    <div class="profile-header-info">
        <h2 class="profile-header-name">${userData.username}</h2>
        <p class="profile-header-handle">${userData.userIdHandle}</p>
        <div class="profile-header-stats">
            <div>
                <strong>${userData.followingCount || 0}</strong>
                <span>Following</span>
            </div>
            <div>
                <strong>${userData.followersCount || 0}</strong>
                <span>Followers</span>
            </div>
        </div>
        <button class="btn btn-secondary">Edit Profile</button>
    </div>
  `;
  headerAvatarLink.textContent = userInitial;
};

/**
 * Renders the questions asked by the user.
 * @param {Array<object>} posts - An array of the user's question objects.
 */
const renderProfilePosts = (posts) => {
  if (posts.length === 0) {
    profilePostsContainer.innerHTML = '<div class="card"><p>You haven\'t asked any questions yet.</p></div>';
    return;
  }

  profilePostsContainer.innerHTML = posts.map(post => {
    const postDate = post.createdAt ? new Date(post.createdAt.seconds * 1000).toLocaleString() : 'Just now';
    return `
      <div class="post-card card">
          <h2 class="post-title">${post.title}</h2>
          <p class="post-meta">Asked on ${postDate}</p>
          <div class="post-footer">
              <button class="post-action-btn"><i class="fas fa-arrow-up"></i> ${post.upvotes || 0}</button>
              <button class="post-action-btn"><i class="fas fa-arrow-down"></i> ${post.downvotes || 0}</button>
              <button class="post-action-btn"><i class="fas fa-comment"></i> ${post.commentCount || 0} Comments</button>
          </div>
      </div>
    `;
  }).join('');
};

// --- FIRESTORE & AUTH LOGIC ---

/**
 * Fetches a user's profile from Firestore.
 * @param {string} uid - The user's unique ID.
 * @returns {Promise<object|null>} The user's data or null if not found.
 */
const getUserProfile = async (uid) => {
  const userRef = doc(db, `artifacts/${appId}/users`, uid);
  const userSnap = await getDoc(userRef);
  return userSnap.exists() ? { id: userSnap.id, ...userSnap.data() } : null;
};

/**
 * Sets up a real-time listener for the current user's questions.
 * @param {string} uid - The user's unique ID.
 */
const listenForUserQuestions = (uid) => {
  const questionsRef = collection(db, `artifacts/${appId}/public/data/questions`);
  const q = query(questionsRef, where("authorId", "==", uid));

  onSnapshot(q, (querySnapshot) => {
    const posts = [];
    querySnapshot.forEach((doc) => {
      posts.push({ id: doc.id, ...doc.data() });
    });
    // Sort by creation date, newest first
    posts.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    renderProfilePosts(posts);
  }, (error) => {
    console.error("Error listening for user questions:", error);
    profilePostsContainer.innerHTML = '<div class="card"><p>Could not load your questions.</p></div>';
  });
};

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      // User is signed in.
      console.log("Authenticated user on profile page:", user.uid);
      const userData = await getUserProfile(user.uid);
      if (userData) {
        renderProfileHeader(userData);
        listenForUserQuestions(user.uid);
      } else {
        profileDetailsContainer.innerHTML = '<p>Could not find user profile.</p>';
      }
    } else {
      // User is signed out, try to authenticate.
      console.log("No user signed in on profile page. Authenticating...");
      authenticateUser();
    }
  });
});
