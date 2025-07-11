// app.js - Logic for index.html

import {
  auth, db, appId, doc, getDoc, setDoc, collection, addDoc, query, onSnapshot,
  serverTimestamp, onAuthStateChanged, authenticateUser, where, runTransaction, increment,
  setAuthPersistence
} from './firebase-config.js';

// --- STATE ---
let currentUser = null;
let answerFeedLoaded = false;

// --- DOM ELEMENTS ---
let postsContainer, answerFeedContainer, askInput, tagsInput, askBtn;

// --- UI RENDERING ---
const renderUserProfile = (userData) => {
  if (!userData) return;
  const userInitial = userData.username.charAt(0).toUpperCase();
  
  const sidebarProfileImg = document.getElementById('sidebar-profile-img');
  if (sidebarProfileImg) sidebarProfileImg.textContent = userInitial;
  
  const sidebarProfileName = document.getElementById('sidebar-profile-name');
  if (sidebarProfileName) sidebarProfileName.textContent = userData.username;

  const sidebarProfileHandle = document.getElementById('sidebar-profile-handle');
  if (sidebarProfileHandle) sidebarProfileHandle.textContent = userData.userIdHandle;

  const sidebarFollowersCount = document.getElementById('sidebar-followers-count');
  if (sidebarFollowersCount) sidebarFollowersCount.textContent = userData.followersCount || 0;

  const sidebarFollowingCount = document.getElementById('sidebar-following-count');
  if (sidebarFollowingCount) sidebarFollowingCount.textContent = userData.followingCount || 0;

  const userAvatarLink = document.getElementById('user-avatar-link');
  if (userAvatarLink) userAvatarLink.textContent = userInitial;
};

const renderPosts = (posts, container) => {
  if (!container) return;
  
  if (posts.length === 0) {
    container.innerHTML = '<div class="card"><p>No questions here right now.</p></div>';
    return;
  }

  container.innerHTML = posts.map(post => {
    const postDate = post.createdAt ? new Date(post.createdAt.seconds * 1000).toLocaleDateString() : 'Just now';
    const tagsHTML = (post.tags || []).map(tag => `<span class="tag">#${tag}</span>`).join('');
    
    return `
      <div class="post-card card" id="post-${post.id}">
        <a href="question.html?id=${post.id}" class="post-link">
          <div class="post-header">
            <div class="anonymous-icon">${post.authorInitial || '?'}</div>
            <div>
              <p class="post-meta"><strong>${post.authorHandle || 'anonymous'}</strong></p>
              <p class="post-meta">Asked ${postDate}</p>
            </div>
          </div>
          <h2 class="post-title">${post.title}</h2>
          <div class="post-tags">${tagsHTML}</div>
        </a>
        <div class="post-footer">
          <button class="post-action-btn vote-btn" data-vote="up" data-id="${post.id}">
            <i class="fas fa-arrow-up"></i> <span id="upvotes-${post.id}">${post.upvotes || 0}</span>
          </button>
          <button class="post-action-btn vote-btn" data-vote="down" data-id="${post.id}">
            <i class="fas fa-arrow-down"></i> <span id="downvotes-${post.id}">${post.downvotes || 0}</span>
          </button>
          <a href="question.html?id=${post.id}#answers" class="post-action-btn">
            <i class="far fa-lightbulb"></i> ${post.answerCount || 0} Answers
          </a>
          <a href="question.html?id=${post.id}#comments" class="post-action-btn">
            <i class="far fa-comment"></i> ${post.commentCount || 0} Comments
          </a>
        </div>
      </div>
    `;
  }).join('');
};

// --- FIRESTORE & APP LOGIC ---
const getUserProfile = async (uid) => {
  const userRef = doc(db, `artifacts/${appId}/users`, uid);
  let userSnap = await getDoc(userRef);

  if (!userSnap.exists()) {
    const shortId = uid.substring(0, 6);
    const newUser = {
      username: `Anonymous #${shortId}`,
      userIdHandle: `@anon_${shortId}`,
      createdAt: serverTimestamp(),
      followersCount: 0,
      followingCount: 0,
    };
    await setDoc(userRef, newUser);
    userSnap = await getDoc(userRef);
  }
  return { id: userSnap.id, ...userSnap.data() };
};

const submitQuestion = async () => {
  const title = askInput.value.trim();
  if (!title) { alert("Question cannot be empty."); return; }
  if (!currentUser) { alert("You must be logged in to ask a question."); return; }

  const tags = tagsInput ? tagsInput.value.split(',').map(tag => tag.trim()).filter(tag => tag) : [];

  try {
    await addDoc(collection(db, `artifacts/${appId}/public/data/questions`), {
      title,
      tags,
      authorId: currentUser.id,
      authorHandle: currentUser.userIdHandle,
      authorInitial: currentUser.username.charAt(0).toUpperCase(),
      createdAt: serverTimestamp(),
      upvotes: 0,
      downvotes: 0,
      voteCount: 0,
      answerCount: 0,
      commentCount: 0, // Initialize comment count
    });
    askInput.value = '';
    if (tagsInput) tagsInput.value = '';
  } catch (error) {
    console.error("Firestore Write Error in submitQuestion:", error);
    alert("Error: Could not submit your question.");
  }
};

const handleVote = async (questionId, voteType) => {
    if (!currentUser) { alert("You must be logged in to vote."); return; }
    
    const voteRef = doc(db, `artifacts/${appId}/users/${currentUser.id}/votes`, questionId);
    const questionRef = doc(db, `artifacts/${appId}/public/data/questions`, questionId);

    await runTransaction(db, async (transaction) => {
        const voteDoc = await transaction.get(voteRef);
        const questionDoc = await transaction.get(questionRef);
        if (!questionDoc.exists()) throw "Question does not exist!";

        const currentVote = voteDoc.exists() ? voteDoc.data().type : null;
        let upvoteInc = 0;
        let downvoteInc = 0;

        if (currentVote === voteType) {
            if (voteType === 'up') upvoteInc = -1; else downvoteInc = -1;
            transaction.delete(voteRef);
        } else {
            if (currentVote === 'up') upvoteInc = -1;
            if (currentVote === 'down') downvoteInc = -1;
            if (voteType === 'up') upvoteInc += 1; else downvoteInc += 1;
            transaction.set(voteRef, { type: voteType });
        }
        
        transaction.update(questionRef, { 
            upvotes: increment(upvoteInc),
            downvotes: increment(downvoteInc),
            voteCount: increment(upvoteInc - downvoteInc)
        });
    }).catch(e => console.error("Vote transaction failed: ", e));
};

const listenForHomeFeed = () => {
    const q = query(collection(db, `artifacts/${appId}/public/data/questions`));
    onSnapshot(q, (snapshot) => {
        const posts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        posts.sort((a, b) => (b.voteCount || 0) - (a.voteCount || 0));
        renderPosts(posts, postsContainer);
    });
};

const listenForAnswerFeed = () => {
    if (!currentUser) return;
    const q = query(collection(db, `artifacts/${appId}/public/data/questions`), where("authorId", "!=", currentUser.id));
    onSnapshot(q, (snapshot) => {
        const posts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        posts.sort((a, b) => (a.answerCount || 0) - (b.answerCount || 0) || (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        renderPosts(posts, answerFeedContainer);
    });
};

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
  postsContainer = document.getElementById('posts-container');
  answerFeedContainer = document.getElementById('answer-feed-container');
  askInput = document.getElementById('ask-input');
  tagsInput = document.getElementById('tags-input');
  askBtn = document.getElementById('ask-btn');

  // Tab switching logic
  const tabs = document.querySelectorAll('.tab-link');
  const tabContents = document.querySelectorAll('.tab-content');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(item => item.classList.remove('active'));
      tab.classList.add('active');
      const target = document.getElementById(tab.dataset.tab);
      tabContents.forEach(content => content.classList.remove('active'));
      target.classList.add('active');

      if (tab.dataset.tab === 'answer' && !answerFeedLoaded) {
        listenForAnswerFeed();
        answerFeedLoaded = true;
      }
    });
  });

  if (askBtn) askBtn.addEventListener('click', submitQuestion);

  document.addEventListener('click', (e) => {
    if (e.target.closest('.vote-btn')) {
      handleVote(e.target.closest('.vote-btn').dataset.id, e.target.closest('.vote-btn').dataset.vote);
    }
  });

  onAuthStateChanged(auth, async (user) => {
    if (user) {
      currentUser = await getUserProfile(user.uid);
      renderUserProfile(currentUser);
      listenForHomeFeed();
    } else {
      await setAuthPersistence();
      authenticateUser();
    }
  });
});
