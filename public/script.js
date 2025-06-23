const registerBtn = document.getElementById("registerBtn");
const loginBtn = document.getElementById("loginBtn");
const registerForm = document.getElementById("registerForm");
const loginForm = document.getElementById("loginForm");

registerBtn.addEventListener("click", () => {
  registerForm.classList.add("active");
  loginForm.classList.remove("active");
  registerBtn.classList.add("active");
  loginBtn.classList.remove("active");
});

loginBtn.addEventListener("click", () => {
  loginForm.classList.add("active");
  registerForm.classList.remove("active");
  loginBtn.classList.add("active");
  registerBtn.classList.remove("active");
});
