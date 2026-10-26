const Auth = (() => {
  const listeners = [];
  let user = null;
  let auth = null;

  const isPlaceholder = (value) => !value || /YOUR_/i.test(value);
  const emit = () => listeners.forEach((fn) => fn(user));

  function init() {
    const fb = (typeof config !== "undefined" && config.firebase) || {};
    const ready =
      typeof firebase !== "undefined" && !isPlaceholder(fb.apiKey) && !isPlaceholder(fb.projectId);
    if (!ready) {
      emit();
      return;
    }
    try {
      firebase.initializeApp(fb);
      auth = firebase.auth();
      auth.useDeviceLanguage();
      auth.onAuthStateChanged((u) => {
        user = u
          ? { uid: u.uid, name: u.displayName || u.email, email: u.email, photoURL: u.photoURL }
          : null;
        emit();
      });
    } catch (error) {
      console.error("Firebase init failed:", error);
      auth = null;
      emit();
    }
  }

  function requireAuth() {
    if (!auth) {
      const err = new Error("not-configured");
      err.code = "app/not-configured";
      throw err;
    }
    return auth;
  }

  async function signInWithGoogle() {
    const provider = new firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    return requireAuth().signInWithPopup(provider);
  }

  async function signInWithEmail(email, password) {
    return requireAuth().signInWithEmailAndPassword(email, password);
  }

  async function registerWithEmail(name, email, password) {
    const cred = await requireAuth().createUserWithEmailAndPassword(email, password);
    if (name) {
      await cred.user.updateProfile({ displayName: name });
      user = { ...user, name };
      emit();
    }
    return cred;
  }

  async function resetPassword(email) {
    return requireAuth().sendPasswordResetEmail(email);
  }

  async function signOut() {
    return requireAuth().signOut();
  }

  function errorMessage(error) {
    const map = {
      "app/not-configured": "Firebase chưa được cấu hình. Hãy điền firebaseConfig trong config.js để bật đăng nhập.",
      "auth/invalid-credential": "Email hoặc mật khẩu không đúng.",
      "auth/user-not-found": "Không tìm thấy tài khoản với email này.",
      "auth/wrong-password": "Mật khẩu không đúng.",
      "auth/email-already-in-use": "Email này đã được đăng ký. Hãy đăng nhập.",
      "auth/weak-password": "Mật khẩu quá yếu. Hãy dùng ít nhất 6 ký tự.",
      "auth/invalid-email": "Địa chỉ email không hợp lệ.",
      "auth/missing-password": "Vui lòng nhập mật khẩu.",
      "auth/popup-closed-by-user": "Bạn đã đóng cửa sổ đăng nhập Google.",
      "auth/cancelled-popup-request": "Yêu cầu đăng nhập đã bị hủy.",
      "auth/popup-blocked": "Trình duyệt đã chặn cửa sổ bật lên. Hãy cho phép popup rồi thử lại.",
      "auth/network-request-failed": "Lỗi kết nối mạng. Vui lòng thử lại.",
      "auth/too-many-requests": "Bạn thử quá nhiều lần. Vui lòng đợi một lát rồi thử lại.",
      "auth/unauthorized-domain": "Tên miền này chưa được thêm vào Authorized domains trong Firebase Console.",
      "auth/operation-not-allowed": "Phương thức đăng nhập này chưa được bật trong Firebase Console.",
    };
    return map[error && error.code] || "Đã xảy ra lỗi. Vui lòng thử lại.";
  }

  return {
    init,
    onChange: (fn) => listeners.push(fn),
    get user() {
      return user;
    },
    get enabled() {
      return !!auth;
    },
    signInWithGoogle,
    signInWithEmail,
    registerWithEmail,
    resetPassword,
    signOut,
    errorMessage,
  };
})();
