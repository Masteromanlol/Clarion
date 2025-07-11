// profile.js - Logic for profile.html

import {
  auth, db, appId, doc, getDoc, setDoc, collection, query, where, onSnapshot,
  onAuthStateChanged, authenticateUser, writeBatch, increment
} from './firebase-config.js';

// --- STATE ---
let currentUser = null;
let viewedUser = null;
const urlParams = new URLSearchParams(window.location.search);
let viewedUserId = urlParams.get('id'); // The ID of the profile being viewed

// --- DOM ELEMENTS ---
const profileDetailsContainer = document.getElementById('profile-details-container');
const profilePostsContainer = document.getElementById('profile-posts-container');
const headerAvatarLink = document.getElementById('user-avatar-link');

// --- UI RENDERING FUNCTIONS ---

/**
 * Renders the main profile header section.
 * @param {object} userData - The user data from Firestore.
 */
const renderProfileHeader = async (userData) => {
    const userInitial = userData.username.charAt(0).toUpperCase();
    let followButtonHTML = '';

    if (currentUser && currentUser.id !== viewedUserId) {
        // Viewing someone else's profile - show follow/unfollow button
        const followDoc = await getDoc(doc(db, `artifacts/${appId}/users/${currentUser.id}/following`, viewedUserId));
        if (followDoc.exists()) {
            followButtonHTML = `<button id="follow-btn" class="btn btn-secondary">Unfollow</button>`;
        } else {
            followButtonHTML = `<button id="follow-btn" class="btn btn-primary">Follow</button>`;
        }
    } else if (currentUser && currentUser.id === viewedUserId) {
        // Viewing own profile - show edit button
        followButtonHTML = `<button id="edit-profile-btn" class="btn btn-secondary">Edit Profile</button>`;
    }

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
            ${followButtonHTML}
        </div>
    `;
};

/**
 * Renders the questions asked by the user.
 * @param {Array<object>} posts - An array of the user's question objects.
 */
const renderProfilePosts = (posts) => {
    const isOwnProfile = currentUser && currentUser.id === viewedUserId;
    
    if (posts.length === 0) {
        const message = isOwnProfile ? 
            "You haven't asked any questions yet." : 
            "This user hasn't asked any questions yet.";
        profilePostsContainer.innerHTML = `<div class="card"><p>${message}</p></div>`;
        return;
    }

    profilePostsContainer.innerHTML = posts.map(post => {
        const postDate = post.createdAt ? 
            new Date(post.createdAt.seconds * 1000).toLocaleDateString() : 
            'Just now';
        
        return `
            <div class="post-card card">
                <a href="question.html?id=${post.id}">
                    <h2 class="post-title">${post.title}</h2>
                    <p class="post-meta">Asked on ${postDate}</p>
                </a>
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
    try {
        const userRef = doc(db, `artifacts/${appId}/users`, uid);
        const userSnap = await getDoc(userRef);
        return userSnap.exists() ? { id: userSnap.id, ...userSnap.data() } : null;
    } catch (error) {
        console.error("Error fetching user profile:", error);
        return null;
    }
};

/**
 * Handles the follow/unfollow functionality.
 */
const handleFollow = async () => {
    if (!currentUser || !viewedUser || currentUser.id === viewedUser.id) return;

    try {
        const batch = writeBatch(db);
        const currentUserRef = doc(db, `artifacts/${appId}/users`, currentUser.id);
        const viewedUserRef = doc(db, `artifacts/${appId}/users`, viewedUser.id);
        const followingRef = doc(db, `artifacts/${appId}/users/${currentUser.id}/following`, viewedUser.id);
        const followerRef = doc(db, `artifacts/${appId}/users/${viewedUser.id}/followers`, currentUser.id);

        const followDoc = await getDoc(followingRef);

        if (followDoc.exists()) { 
            // Unfollow
            batch.delete(followingRef);
            batch.delete(followerRef);
            batch.update(currentUserRef, { followingCount: increment(-1) });
            batch.update(viewedUserRef, { followersCount: increment(-1) });
        } else { 
            // Follow
            batch.set(followingRef, { userId: viewedUser.id, createdAt: new Date() });
            batch.set(followerRef, { userId: currentUser.id, createdAt: new Date() });
            batch.update(currentUserRef, { followingCount: increment(1) });
            batch.update(viewedUserRef, { followersCount: increment(1) });
        }

        await batch.commit();
        // Re-render the header to update the button and counts
        await loadProfile(viewedUserId);
    } catch (error) {
        console.error("Error handling follow/unfollow:", error);
    }
};

/**
 * Sets up a real-time listener for the user's questions.
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
        profilePostsContainer.innerHTML = '<div class="card"><p>Could not load questions.</p></div>';
    });
};

/**
 * Loads and displays a user's profile.
 * @param {string} uid - The user's unique ID.
 */
const loadProfile = async (uid) => {
    try {
        const userData = await getUserProfile(uid);
        
        if (userData) {
            viewedUser = userData;
            await renderProfileHeader(userData);
            listenForUserQuestions(uid);
        } else {
            profileDetailsContainer.innerHTML = "<h1>User not found.</h1>";
        }
    } catch (error) {
        console.error("Error loading profile:", error);
        profileDetailsContainer.innerHTML = "<h1>Error loading profile.</h1>";
    }
};

// --- EVENT LISTENERS ---
profileDetailsContainer.addEventListener('click', (e) => {
    if (e.target.id === 'follow-btn') {
        handleFollow();
    } else if (e.target.id === 'edit-profile-btn') {
        // TODO: Implement edit profile functionality
        console.log("Edit profile clicked");
    }
});

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            // User is signed in
            console.log("Authenticated user on profile page:", user.uid);
            const userData = await getUserProfile(user.uid);
            
            if (userData) {
                currentUser = userData;
                headerAvatarLink.textContent = currentUser.username.charAt(0).toUpperCase();

                // If no ID in URL, view own profile
                if (!viewedUserId) { 
                    viewedUserId = user.uid; 
                }
                
                await loadProfile(viewedUserId);
            } else {
                profileDetailsContainer.innerHTML = '<p>Could not find user profile.</p>';
            }
        } else {
            // User is signed out
            console.log("No user signed in on profile page.");
            
            if (viewedUserId) {
                // Can still view other profiles when not logged in
                await loadProfile(viewedUserId);
            } else {
                // If no ID in URL and not logged in, prompt to sign in
                console.log("Authenticating user...");
                authenticateUser();
            }
        }
    });
});