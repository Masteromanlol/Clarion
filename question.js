// question.js - Logic for question.html

import {
  auth, db, appId, doc, getDoc, collection, addDoc, query, onSnapshot,
  serverTimestamp, onAuthStateChanged, authenticateUser, where, increment, runTransaction
} from './firebase-config.js';

// --- STATE ---
let currentUser = null;
const urlParams = new URLSearchParams(window.location.search);
const questionId = urlParams.get('id');

// --- DOM ELEMENTS ---
const questionContainer = document.getElementById('question-container');
const commentsContainer = document.getElementById('comments-container');
const commentInput = document.getElementById('comment-input');
const commentSubmitBtn = document.getElementById('comment-submit-btn');

// --- UI RENDERING ---
const renderQuestion = (post) => {
    const postDate = post.createdAt ? new Date(post.createdAt.seconds * 1000).toLocaleString() : 'Just now';
    const tagsHTML = (post.tags || []).map(tag => `<span class="tag">#${tag}</span>`).join('');

    questionContainer.innerHTML = `
        <div class="post-header">
            <div class="anonymous-icon">${post.authorInitial || '?'}</div>
            <div>
                <p class="post-meta"><strong><a href="profile.html?id=${post.authorId}">${post.authorHandle || 'anonymous'}</a></strong></p>
                <p class="post-meta">Asked ${postDate}</p>
            </div>
        </div>
        <h2 class="post-title">${post.title}</h2>
        <div class="post-tags">${tagsHTML}</div>
        <div class="post-footer">
            <button class="post-action-btn"><i class="fas fa-arrow-up"></i> ${post.upvotes || 0}</button>
            <button class="post-action-btn"><i class="fas fa-arrow-down"></i> ${post.downvotes || 0}</button>
            <button class="post-action-btn share-btn" data-id="${post.id}"><i class="fas fa-share"></i> Share</button>
            <button class="post-action-btn report-btn" data-id="${post.id}" data-type="question"><i class="fas fa-flag"></i> Report</button>
        </div>
    `;
};

const renderComments = (comments) => {
    if (comments.length === 0) {
        commentsContainer.innerHTML = '<p>No comments yet. Be the first to respond!</p>';
        return;
    }
    commentsContainer.innerHTML = comments.map(comment => {
        const commentDate = comment.createdAt ? new Date(comment.createdAt.seconds * 1000).toLocaleString() : 'Just now';
        return `
            <div class="comment-card">
                <div class="comment-avatar">${comment.authorInitial || '?'}</div>
                <div class="comment-body">
                    <p class="comment-meta">
                        <strong><a href="profile.html?id=${comment.authorId}">${comment.authorHandle || 'anonymous'}</a></strong>
                        <span>• ${commentDate}</span>
                    </p>
                    <p class="comment-text">${comment.text}</p>
                    <div class="comment-actions">
                        <button class="comment-action-btn report-btn" data-id="${comment.id}" data-type="comment"><i class="fas fa-flag"></i> Report</button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
};

// --- FIRESTORE & APP LOGIC ---
const loadQuestionAndComments = async () => {
    if (!questionId) {
        questionContainer.innerHTML = "<h1>Question not found</h1><p>Invalid link.</p>";
        return;
    }

    // Fetch the question
    const questionRef = doc(db, `artifacts/${appId}/public/data/questions`, questionId);
    const questionSnap = await getDoc(questionRef);

    if (questionSnap.exists()) {
        renderQuestion({ id: questionSnap.id, ...questionSnap.data() });
    } else {
        questionContainer.innerHTML = "<h1>Question not found</h1><p>This question may have been deleted.</p>";
    }

    // Listen for comments
    const commentsQuery = query(collection(db, `artifacts/${appId}/public/data/comments`), where("questionId", "==", questionId));
    onSnapshot(commentsQuery, (snapshot) => {
        const comments = [];
        snapshot.forEach(doc => comments.push({ id: doc.id, ...doc.data() }));
        comments.sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
        renderComments(comments);
    });
};

const submitComment = async () => {
    const text = commentInput.value.trim();
    if (!text || !currentUser || !questionId) return;

    try {
        const questionRef = doc(db, `artifacts/${appId}/public/data/questions`, questionId);
        
        // Add comment and update question's comment count in a transaction
        await runTransaction(db, async (transaction) => {
            const newCommentRef = doc(collection(db, `artifacts/${appId}/public/data/comments`));
            transaction.set(newCommentRef, {
                text,
                questionId,
                authorId: currentUser.id,
                authorHandle: currentUser.userIdHandle,
                authorInitial: currentUser.username.charAt(0).toUpperCase(),
                createdAt: serverTimestamp(),
            });
            transaction.update(questionRef, { commentCount: increment(1) });
        });
        
        commentInput.value = '';
    } catch (error) {
        console.error("Error submitting comment: ", error);
        alert("Could not submit comment.");
    }
};

const handleReport = async (contentId, contentType) => {
    if (!currentUser) { alert("You must be logged in to report content."); return; }
    const reason = prompt(`Why are you reporting this ${contentType}?`);
    if (reason && reason.trim()) {
        const reportRef = doc(collection(db, `artifacts/${appId}/public/data/reports`));
        await setDoc(reportRef, {
            contentId,
            contentType,
            reason: reason.trim(),
            reporterId: currentUser.id,
            createdAt: serverTimestamp(),
            status: 'new'
        });
        alert("Thank you for your report. Our moderators will review it shortly.");
    }
};

// --- EVENT LISTENERS ---
commentSubmitBtn.addEventListener('click', submitComment);
document.addEventListener('click', (e) => {
    if (e.target.closest('.report-btn')) {
        const btn = e.target.closest('.report-btn');
        handleReport(btn.dataset.id, btn.dataset.type);
    }
    if (e.target.closest('.share-btn')) {
        const btn = e.target.closest('.share-btn');
        const url = window.location.href;
        navigator.clipboard.writeText(url).then(() => alert('Link copied to clipboard!'));
    }
});


// --- INITIALIZATION ---
onAuthStateChanged(auth, async (user) => {
    if (user) {
        const userDoc = await getDoc(doc(db, `artifacts/${appId}/users`, user.uid));
        currentUser = { id: user.uid, ...userDoc.data() };
        document.getElementById('user-avatar-link').textContent = currentUser.username.charAt(0).toUpperCase();
        loadQuestionAndComments();
    } else {
        authenticateUser();
    }
});
