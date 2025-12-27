import path from "path";
import { createServer as createHttpServer } from "http";
import "dotenv/config";
import express from "express";
import cors from "cors";
import mongoose, { Schema } from "mongoose";
import crypto from "crypto";
import https from "https";
import { Server } from "socket.io";

const MONGODB_URI = process.env.MONGODB_URI;
let isConnected = false;
async function connectDB() {
  if (isConnected) return;
  try {
    await mongoose.connect(MONGODB_URI);
    isConnected = true;
    console.log("✅ Connected to MongoDB successfully");
  } catch (error) {
    console.error("❌ Failed to connect to MongoDB:", error);
    throw error;
  }
}

// ===== Schemas =====
const UserModel = mongoose.model("User", new Schema({
  id: { type: String, unique: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  name: { type: String, required: true },
  password: { type: String, required: true },
  role: { type: String, enum: ["admin", "team_member"], required: true },
  adminId: { type: String, sparse: true },
  createdAt: { type: String, required: true }
}, { collection: "users" }));

const TwilioCredentialsModel = mongoose.model("TwilioCredentials", new Schema({
  adminId: { type: String, required: true, unique: true },
  accountSid: { type: String, required: true },
  authToken: { type: String, required: true },
  connectedAt: { type: String, required: true }
}, { collection: "twilio_credentials" }));

const PhoneNumberModel = mongoose.model("PhoneNumber", new Schema({
  id: { type: String, required: true, unique: true },
  adminId: { type: String, required: true },
  phoneNumber: { type: String, required: true },
  assignedTo: { type: String, sparse: true },
  purchasedAt: { type: String, required: true },
  active: { type: Boolean, default: true }
}, { collection: "phone_numbers" }));

const TeamMemberModel = mongoose.model("TeamMember", new Schema({
  id: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  name: { type: String, required: true },
  password: { type: String, required: true },
  adminId: { type: String, required: true },
  status: { type: String, enum: ["pending", "active"], default: "active" },
  createdAt: { type: String, required: true }
}, { collection: "team_members" }));

const MessageModel = mongoose.model("Message", new Schema({
  id: { type: String, required: true, unique: true },
  phoneNumberId: { type: String, required: true },
  from: { type: String, required: true },
  to: { type: String, required: true },
  body: { type: String, required: true },
  direction: { type: String, enum: ["inbound", "outbound"], required: true },
  timestamp: { type: String, required: true },
  sid: { type: String, sparse: true }
}, { collection: "messages" }));

const ContactModel = mongoose.model("Contact", new Schema({
  id: { type: String, required: true, unique: true },
  phoneNumberId: { type: String, required: true },
  phoneNumber: { type: String, required: true },
  name: { type: String, sparse: true },
  lastMessage: { type: String, sparse: true },
  lastMessageTime: { type: String, sparse: true },
  unreadCount: { type: Number, default: 0 }
}, { collection: "contacts" }));

const WalletModel = mongoose.model("Wallet", new Schema({
  adminId: { type: String, required: true, unique: true },
  balance: { type: Number, required: true, default: 0 },
  currency: { type: String, required: true, default: "USD" },
  createdAt: { type: String, required: true },
  updatedAt: { type: String, required: true }
}, { collection: "wallets" }));

const WalletTransactionModel = mongoose.model("WalletTransaction", new Schema({
  adminId: { type: String, required: true },
  type: { type: String, enum: ["credit", "debit"], required: true },
  amount: { type: Number, required: true },
  description: { type: String, required: true },
  reference: { type: String, sparse: true },
  createdAt: { type: String, required: true }
}, { collection: "wallet_transactions" }));

// ===== Storage class =====
class Storage {
  async createUser(user) { return await new UserModel(user).save(); }
  async getUserByEmail(email) { return await UserModel.findOne({ email: email.toLowerCase() }); }
  async getUserById(id) { return await UserModel.findOne({ $or: [{ id }, { _id: id }] }); }
  async setTwilioCredentials(credentials) { await TwilioCredentialsModel.updateOne({ adminId: credentials.adminId }, credentials, { upsert: true }); }
  async getTwilioCredentialsByAdminId(adminId) { return await TwilioCredentialsModel.findOne({ adminId }); }
  async removeTwilioCredentials(adminId) { await TwilioCredentialsModel.deleteOne({ adminId }); }
  async addPhoneNumber(number) { return await new PhoneNumberModel(number).save(); }
  async getPhoneNumbersByAdminId(adminId) { return await PhoneNumberModel.find({ adminId }); }
  async getPhoneNumberById(id) { return await PhoneNumberModel.findOne({ $or: [{ id }, { _id: id }] }); }
  async getPhoneNumberByPhoneNumber(phoneNumber) { return await PhoneNumberModel.findOne({ phoneNumber }); }
  async updatePhoneNumber(number) { await PhoneNumberModel.findOneAndUpdate({ id: number.id }, number, { new: true }); }
  async addTeamMember(member) { return await new TeamMemberModel(member).save(); }
  async getTeamMembersByAdminId(adminId) { return await TeamMemberModel.find({ adminId }); }
  async getTeamMemberById(id) { return await TeamMemberModel.findOne({ id }); }
  async removeTeamMember(memberId) { await TeamMemberModel.deleteOne({ id: memberId }); }
  async addMessage(message) { return await new MessageModel(message).save(); }
  async getMessagesByPhoneNumber(phoneNumberId) { return await MessageModel.find({ phoneNumberId }).sort({ timestamp: -1 }); }
  async addContact(contact) { return await new ContactModel(contact).save(); }
  async getContactsByPhoneNumber(phoneNumberId) { return await ContactModel.find({ phoneNumberId }); }
  async getContactById(id) { return await ContactModel.findOne({ id }); }
  async updateContact(contact) { await ContactModel.findOneAndUpdate({ id: contact.id }, contact, { new: true }); }
  async deleteContact(id) { await ContactModel.deleteOne({ id }); }
  async getOrCreateWallet(adminId) { let w = await WalletModel.findOne({ adminId }); if (!w) w = await new WalletModel({ adminId, balance: 0, currency: "USD", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }).save(); return w; }
  async getWallet(adminId) { return await WalletModel.findOne({ adminId }); }
  async updateWalletBalance(adminId, newBalance) { await WalletModel.updateOne({ adminId }, { balance: newBalance, updatedAt: new Date().toISOString() }, { upsert: true }); }
  async addWalletTransaction(tx) { return await new WalletTransactionModel(tx).save(); }
  async getWalletTransactions(adminId, limit = 50) { return await WalletTransactionModel.find({ adminId }).sort({ createdAt: -1 }).limit(limit); }
  generateId() { return Math.random().toString(36).substr(2, 9); }
}
const storage = new Storage();

// ===== JWT helpers =====
const JWT_SECRET = process.env.JWT_SECRET || "change-me";

function base64UrlEncode(str) {
  return Buffer.from(str).toString("base64")
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}
function base64UrlDecode(str) {
  str += new Array(5 - str.length % 4).join("=");
  return Buffer.from(str.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString();
}
function generateToken(payload) {
  const now = Math.floor(Date.now() / 1000);
  const jwtPayload = { ...payload, iat: now, exp: now + 24 * 60 * 60 };
  const header = base64UrlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload64 = base64UrlEncode(JSON.stringify(jwtPayload));
  const signature = crypto.createHmac("sha256", JWT_SECRET)
    .update(`${header}.${payload64}`).digest();
  const signature64 = base64UrlEncode(signature.toString("base64"));
  return `${header}.${payload64}.${signature64}`;
}
function verifyToken(token) {
  try {
    const [header64, payload64, signature64] = token.split(".");
    const signature = crypto.createHmac("sha256", JWT_SECRET)
      .update(`${header64}.${payload64}`).digest();
    const expectedSignature = base64UrlEncode(signature.toString("base64"));
    if (signature64 !== expectedSignature) return null;
    const payload = JSON.parse(base64UrlDecode(payload64));
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch { return null; }
}
function extractTokenFromHeader(authHeader) {
  if (!authHeader) return null;
  const parts = authHeader.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer") return null;
  return parts[1];
}
function hashPassword(password) {
  return crypto.createHash("sha256").update(password).digest("hex");
}
function verifyPassword(password, hash) {
  return hashPassword(password) === hash;
}

// ===== Auth Handlers =====
const handleSignup = async (req, res) => {
  try {
    const { email, password, name } = req.body;
    if (!email || !password || !name) return res.status(400).json({ error: "Missing fields" });
    const existingUser = await storage.getUserByEmail(email);
    if (existingUser) return res.status(400).json({ error: "User already exists" });
    const userId = storage.generateId();
    const hashedPassword = hashPassword(password);
    const user = { id: userId, email, name, password: hashedPassword, role: "admin", createdAt: new Date().toISOString() };
    await storage.createUser(user);
    const token = generateToken({ userId, email, role: "admin" });
    res.json({ user: { id: userId, email, name, role: "admin", createdAt: user.createdAt }, token });
  } catch (error) { res.status(500).json({ error: "Internal server error" }); }
};

const handleLogin = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Missing fields" });
    const user = await storage.getUserByEmail(email);
    if (!user || !verifyPassword(password, user.password)) return res.status(401).json({ error: "Invalid credentials" });
    const token = generateToken({ userId: user.id, email: user.email, role: user.role });
    res.json({ user: { id: user.id, email: user.email, name: user.name, role: user.role, adminId: user.adminId, createdAt: user.createdAt }, token });
  } catch (error) { res.status(500).json({ error: "Internal server error" }); }
};

const handleGetProfile = async (req, res) => {
  try {
    const user = await storage.getUserById(req.userId);
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json({ user });
  } catch (error) { res.status(500).json({ error: "Internal server error" }); }
};

// ===== Middleware =====
const authMiddleware = async (req, res, next) => {
  try {
    const token = extractTokenFromHeader(req.headers.authorization);
    if (!token) return res.status(401).json({ error: "Missing token" });
    const payload = verifyToken(token);
    if (!payload) return res.status(401).json({ error: "Invalid token" });
    req.userId = payload.userId;
    req.userRole = payload.role;
    next();
  } catch { res.status(401).json({ error: "Auth failed" }); }
};
const adminOnly = (req, res, next) => {
  if (req.userRole !== "admin") return res.status(403).json({ error: "Admins only" });
  next();
};

// ===== Express App =====
async function createServer() {
  await connectDB();
  const app = express();
  app.use(cors());

// Is mein change karo:
app.use(
  cors({
    origin: [
      "https://smshub.netlify.app",
      "http://localhost:3000",
      "http://localhost:8080",
      /^https:\/\/.*\.fly\.dev$/, // Allow all fly.dev preview URLs
    ],
    credentials: true,
  })
);
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Routes
  app.post("/api/auth/signup", handleSignup);
  app.post("/api/auth/login", handleLogin);
  app.get("/api/auth/profile", authMiddleware, handleGetProfile);

  // ... mount all other handlers (credentials, numbers, team, wallet, contacts, messages, webhooks) here ...

  return app;
}

// ===== Socket.IO =====
function setupSocketIO(httpServer) {
  const io = new Server(httpServer, {
    cors: { origin: "https://smshub.netlify.app", methods: ["GET", "POST"], credentials: true }
  });
  io.use((socket, next) => {
    const token = extractTokenFromHeader(socket.handshake.auth.authorization);
    const payload = verifyToken(token);
    if (!payload) return next(new Error("Invalid token"));
    socket.userId = payload.userId;
    socket.userRole = payload.role;
    next();
  });
  io.on("connection", (socket) => {
    socket.join(`user:${socket.userId}`);
    if (socket.userRole === "admin") socket.join(`admin:${socket.userId}`);
  });
  return io;
}

// ===== Start Server =====
async function startServer() {
  try {
    const app = await createServer();
    const httpServer = createHttpServer(app);
    const io = setupSocketIO(httpServer);
    const port = process.env.PORT || 3000;
    httpServer.listen(port, () => {
      console.log(`🚀 SMSHub server running on port ${port}`);
      console.log(`📱 Frontend: https://smshub.netlify.app`);
      console.log(`🔧 API: https://smshub-ki80.onrender.com/api`);
      console.log(`⚡ WebSocket: wss://smshub-ki80.onrender.com`);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}
startServer();
