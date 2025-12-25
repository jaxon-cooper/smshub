import path from "path";
import { createServer as createServer$1 } from "http";
import "dotenv/config";
import * as express from "express";
import express__default from "express";
import cors from "cors";
import mongoose, { Schema } from "mongoose";
import crypto from "crypto";
import https from "https";
import { Server } from "socket.io";
const MONGODB_URI = process.env.MONGODB_URI;
let isConnected = false;
async function connectDB() {
  if (isConnected) {
    console.log("Already connected to MongoDB");
    return;
  }
  try {
    await mongoose.connect(MONGODB_URI);
    isConnected = true;
    console.log("Connected to MongoDB successfully");
  } catch (error) {
    console.error("Failed to connect to MongoDB:", error);
    throw error;
  }
}
const userSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true },
    name: { type: String, required: true },
    password: { type: String, required: true },
    role: { type: String, enum: ["admin", "team_member"], required: true },
    adminId: { type: String, sparse: true },
    createdAt: { type: String, required: true }
  },
  { collection: "users" }
);
const UserModel = mongoose.model("User", userSchema);
const twilioCredentialsSchema = new Schema(
  {
    adminId: { type: String, required: true, unique: true },
    accountSid: { type: String, required: true },
    authToken: { type: String, required: true },
    connectedAt: { type: String, required: true }
  },
  { collection: "twilio_credentials" }
);
const TwilioCredentialsModel = mongoose.model(
  "TwilioCredentials",
  twilioCredentialsSchema
);
const phoneNumberSchema = new Schema(
  {
    id: { type: String, required: true, unique: true },
    adminId: { type: String, required: true },
    phoneNumber: { type: String, required: true },
    assignedTo: { type: String, sparse: true },
    purchasedAt: { type: String, required: true },
    active: { type: Boolean, default: true }
  },
  { collection: "phone_numbers" }
);
const PhoneNumberModel = mongoose.model(
  "PhoneNumber",
  phoneNumberSchema
);
const teamMemberSchema = new Schema(
  {
    id: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    name: { type: String, required: true },
    password: { type: String, required: true },
    adminId: { type: String, required: true },
    status: { type: String, enum: ["pending", "active"], default: "active" },
    createdAt: { type: String, required: true }
  },
  { collection: "team_members" }
);
const TeamMemberModel = mongoose.model(
  "TeamMember",
  teamMemberSchema
);
const messageSchema = new Schema(
  {
    id: { type: String, required: true, unique: true },
    phoneNumberId: { type: String, required: true },
    from: { type: String, required: true },
    to: { type: String, required: true },
    body: { type: String, required: true },
    direction: { type: String, enum: ["inbound", "outbound"], required: true },
    timestamp: { type: String, required: true },
    sid: { type: String, sparse: true }
  },
  { collection: "messages" }
);
messageSchema.index({ phoneNumberId: 1, timestamp: -1 });
const MessageModel = mongoose.model("Message", messageSchema);
const contactSchema = new Schema(
  {
    id: { type: String, required: true, unique: true },
    phoneNumberId: { type: String, required: true },
    phoneNumber: { type: String, required: true },
    name: { type: String, sparse: true },
    lastMessage: { type: String, sparse: true },
    lastMessageTime: { type: String, sparse: true },
    unreadCount: { type: Number, default: 0 }
  },
  { collection: "contacts" }
);
contactSchema.index({ phoneNumberId: 1 });
const ContactModel = mongoose.model("Contact", contactSchema);
const walletSchema = new Schema(
  {
    adminId: { type: String, required: true, unique: true },
    balance: { type: Number, required: true, default: 0 },
    currency: { type: String, required: true, default: "USD" },
    createdAt: { type: String, required: true },
    updatedAt: { type: String, required: true }
  },
  { collection: "wallets" }
);
const WalletModel = mongoose.model("Wallet", walletSchema);
const walletTransactionSchema = new Schema(
  {
    adminId: { type: String, required: true },
    type: { type: String, enum: ["credit", "debit"], required: true },
    amount: { type: Number, required: true },
    description: { type: String, required: true },
    reference: { type: String, sparse: true },
    createdAt: { type: String, required: true }
  },
  { collection: "wallet_transactions" }
);
walletTransactionSchema.index({ adminId: 1, createdAt: -1 });
const WalletTransactionModel = mongoose.model(
  "WalletTransaction",
  walletTransactionSchema
);
class Storage {
  // User operations
  async createUser(user) {
    const newUser = new UserModel(user);
    await newUser.save();
  }
  async getUserByEmail(email) {
    return await UserModel.findOne({ email: email.toLowerCase() });
  }
  async getUserById(id) {
    const user = await UserModel.findById(id);
    if (!user) return void 0;
    const { password, ...userWithoutPassword } = user.toObject();
    return userWithoutPassword;
  }
  // Twilio Credentials
  async setTwilioCredentials(credentials) {
    await TwilioCredentialsModel.updateOne(
      { adminId: credentials.adminId },
      credentials,
      { upsert: true }
    );
  }
  async getTwilioCredentialsByAdminId(adminId) {
    return await TwilioCredentialsModel.findOne({
      adminId
    });
  }
  async removeTwilioCredentials(adminId) {
    await TwilioCredentialsModel.deleteOne({ adminId });
  }
  // Phone Numbers
  async addPhoneNumber(number) {
    const newNumber = new PhoneNumberModel(number);
    await newNumber.save();
  }
  async getPhoneNumbersByAdminId(adminId) {
    const numbers = await PhoneNumberModel.find({ adminId });
    return numbers.map((doc) => {
      const data = doc.toObject();
      if (!data.id && data._id) {
        data.id = data._id.toString();
      }
      return data;
    });
  }
  async getPhoneNumberById(id) {
    const doc = await PhoneNumberModel.findOne({ $or: [{ id }, { _id: id }] });
    if (!doc) return void 0;
    const data = doc.toObject();
    if (!data.id && data._id) {
      data.id = data._id.toString();
    }
    return data;
  }
  async getPhoneNumberByPhoneNumber(phoneNumber) {
    const doc = await PhoneNumberModel.findOne({ phoneNumber });
    if (!doc) return void 0;
    const data = doc.toObject();
    if (!data.id && data._id) {
      data.id = data._id.toString();
    }
    return data;
  }
  async updatePhoneNumber(number) {
    await PhoneNumberModel.findOneAndUpdate({ id: number.id }, number, {
      new: true
    });
  }
  // Team Members
  async addTeamMember(member) {
    const newMember = new TeamMemberModel(member);
    await newMember.save();
  }
  async getTeamMembersByAdminId(adminId) {
    const members = await TeamMemberModel.find({ adminId });
    return members.map((member) => {
      const { password, ...teamMember } = member.toObject();
      return teamMember;
    });
  }
  async getTeamMemberById(id) {
    const member = await TeamMemberModel.findOne({ id });
    if (!member) return void 0;
    const { password, ...memberWithoutPassword } = member.toObject();
    return memberWithoutPassword;
  }
  async getAdminIdByTeamMemberId(teamMemberId) {
    const member = await TeamMemberModel.findOne({ id: teamMemberId });
    return member?.adminId;
  }
  async removeTeamMember(memberId) {
    await UserModel.deleteOne({ id: memberId, role: "team_member" });
    await TeamMemberModel.deleteOne({ id: memberId });
  }
  // Messages
  async addMessage(message) {
    const newMessage = new MessageModel(message);
    await newMessage.save();
  }
  async getMessagesByPhoneNumber(phoneNumberId) {
    const messages = await MessageModel.find({ phoneNumberId }).sort({
      timestamp: 1
    });
    return messages.map((doc) => {
      const data = doc.toObject();
      if (!data.id && data._id) {
        data.id = data._id.toString();
      }
      return data;
    });
  }
  // Contacts
  async addContact(contact) {
    const newContact = new ContactModel(contact);
    await newContact.save();
  }
  async getContactsByPhoneNumber(phoneNumberId) {
    const contacts = await ContactModel.find({ phoneNumberId });
    return contacts.map((doc) => {
      const data = doc.toObject();
      if (!data.id && data._id) {
        data.id = data._id.toString();
      }
      return data;
    });
  }
  async getContactById(id) {
    let doc = await ContactModel.findOne({ id });
    if (!doc && /^[0-9a-f]{24}$/i.test(id)) {
      try {
        doc = await ContactModel.findById(id);
      } catch (error) {
      }
    }
    if (!doc) return void 0;
    const data = doc.toObject();
    if (!data.id) {
      if (data._id) {
        data.id = data._id.toString();
      } else {
        console.warn("Contact has no ID field:", data);
      }
    }
    return data;
  }
  async updateContact(contact) {
    await ContactModel.findOneAndUpdate({ id: contact.id }, contact, {
      new: true
    });
  }
  async deleteContact(id) {
    await ContactModel.deleteOne({ id });
  }
  // Wallet operations
  async getOrCreateWallet(adminId) {
    let wallet = await WalletModel.findOne({ adminId });
    if (!wallet) {
      const newWallet = new WalletModel({
        adminId,
        balance: 0,
        currency: "USD",
        createdAt: (/* @__PURE__ */ new Date()).toISOString(),
        updatedAt: (/* @__PURE__ */ new Date()).toISOString()
      });
      wallet = await newWallet.save();
    }
    return wallet;
  }
  async getWallet(adminId) {
    return await WalletModel.findOne({ adminId });
  }
  async updateWalletBalance(adminId, newBalance) {
    await WalletModel.updateOne(
      { adminId },
      {
        balance: newBalance,
        updatedAt: (/* @__PURE__ */ new Date()).toISOString()
      },
      { upsert: true }
    );
  }
  async addWalletTransaction(transaction) {
    const newTransaction = new WalletTransactionModel(transaction);
    await newTransaction.save();
  }
  async getWalletTransactions(adminId, limit = 50) {
    return await WalletTransactionModel.find({ adminId }).sort({ createdAt: -1 }).limit(limit);
  }
  // Utility
  generateId() {
    return Math.random().toString(36).substr(2, 9);
  }
}
const storage = new Storage();
const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-in-production";
function base64UrlEncode(str) {
  return Buffer.from(str).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}
function base64UrlDecode(str) {
  str += new Array(5 - str.length % 4).join("=");
  return Buffer.from(
    str.replace(/-/g, "+").replace(/_/g, "/"),
    "base64"
  ).toString();
}
function generateToken(payload) {
  const now = Math.floor(Date.now() / 1e3);
  const jwtPayload = {
    ...payload,
    iat: now,
    exp: now + 24 * 60 * 60
    // 24 hours
  };
  const header = base64UrlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload64 = base64UrlEncode(JSON.stringify(jwtPayload));
  const signature = crypto.createHmac("sha256", JWT_SECRET).update(`${header}.${payload64}`).digest();
  const signature64 = base64UrlEncode(signature.toString("base64"));
  return `${header}.${payload64}.${signature64}`;
}
function verifyToken(token) {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [header64, payload64, signature64] = parts;
    const signature = crypto.createHmac("sha256", JWT_SECRET).update(`${header64}.${payload64}`).digest();
    const expectedSignature = base64UrlEncode(signature.toString("base64"));
    if (signature64 !== expectedSignature) return null;
    const payload = JSON.parse(base64UrlDecode(payload64));
    if (payload.exp < Math.floor(Date.now() / 1e3)) return null;
    return payload;
  } catch {
    return null;
  }
}
function extractTokenFromHeader(authHeader) {
  if (!authHeader) return null;
  const parts = authHeader.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer") return null;
  return parts[1];
}
function hashPassword$1(password) {
  return crypto.createHash("sha256").update(password).digest("hex");
}
function verifyPassword(password, hash) {
  return hashPassword$1(password) === hash;
}
const handleSignup = async (req, res) => {
  try {
    const { email, password, name } = req.body;
    if (!email || !password || !name) {
      return res.status(400).json({ error: "Missing required fields" });
    }
    const existingUser = await storage.getUserByEmail(email);
    if (existingUser) {
      return res.status(400).json({ error: "User already exists" });
    }
    const userId = storage.generateId();
    const hashedPassword = hashPassword$1(password);
    const user = {
      id: userId,
      email,
      name,
      password: hashedPassword,
      role: "admin",
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    await storage.createUser(user);
    const token = generateToken({
      userId,
      email,
      role: "admin"
    });
    const userResponse = {
      id: userId,
      email,
      name,
      role: "admin",
      createdAt: user.createdAt
    };
    const response = {
      user: userResponse,
      token
    };
    res.json(response);
  } catch (error) {
    console.error("Signup error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};
const handleLogin = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Missing required fields" });
    }
    const user = await storage.getUserByEmail(email);
    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }
    if (!verifyPassword(password, user.password)) {
      return res.status(401).json({ error: "Invalid credentials" });
    }
    const token = generateToken({
      userId: user.id,
      email: user.email,
      role: user.role
    });
    const userResponse = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      adminId: user.adminId,
      createdAt: user.createdAt
    };
    const response = {
      user: userResponse,
      token
    };
    res.json(response);
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};
const handleGetProfile = async (req, res) => {
  try {
    const userId = req.userId;
    const user = await storage.getUserById(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    res.json({ user });
  } catch (error) {
    console.error("Get profile error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};
function hashPassword(password) {
  return crypto.createHash("sha256").update(password).digest("hex");
}
async function validateTwilioCredentials(accountSid, authToken) {
  return new Promise((resolve) => {
    try {
      if (!accountSid.startsWith("AC") || accountSid.length !== 34) {
        return resolve({
          valid: false,
          error: "Invalid Account SID format (should start with AC and be 34 characters)"
        });
      }
      if (authToken.length < 32) {
        return resolve({
          valid: false,
          error: "Invalid Auth Token format (should be at least 32 characters)"
        });
      }
      const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
      const options = {
        hostname: "api.twilio.com",
        path: `/2010-04-01/Accounts/${accountSid}/Calls.json?PageSize=1`,
        method: "GET",
        headers: {
          Authorization: `Basic ${auth}`
        }
      };
      const req = https.request(options, (res) => {
        if (res.statusCode === 401) {
          return resolve({
            valid: false,
            error: "Invalid Twilio credentials (401 Unauthorized). Please check your Account SID and Auth Token."
          });
        }
        if (res.statusCode === 403) {
          return resolve({
            valid: false,
            error: "Access forbidden (403). Your Twilio account may be suspended or restricted."
          });
        }
        if (res.statusCode === 200 || res.statusCode === 429) {
          return resolve({ valid: true });
        }
        if (res.statusCode && res.statusCode >= 500) {
          return resolve({
            valid: false,
            error: "Twilio API error. Please try again later."
          });
        }
        return resolve({ valid: true });
      });
      req.on("error", (error) => {
        console.error("Twilio validation error:", error);
        return resolve({
          valid: false,
          error: "Failed to connect to Twilio API. Please check your internet connection."
        });
      });
      req.end();
    } catch (error) {
      console.error("Credential validation error:", error);
      return resolve({
        valid: false,
        error: "Failed to validate credentials"
      });
    }
  });
}
const handleSaveCredentials = async (req, res) => {
  try {
    const adminId = req.userId;
    const { accountSid, authToken } = req.body;
    if (!accountSid || !authToken) {
      return res.status(400).json({ error: "Please enter both Account SID and Auth Token" });
    }
    const validation = await validateTwilioCredentials(accountSid, authToken);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }
    const credentialsId = storage.generateId();
    const credentials = {
      id: credentialsId,
      adminId,
      accountSid,
      authToken,
      connectedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    storage.setTwilioCredentials(credentials);
    res.json({ credentials });
  } catch (error) {
    console.error("Save credentials error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};
const handleGetCredentials = async (req, res) => {
  try {
    const adminId = req.userId;
    const credentials = await storage.getTwilioCredentialsByAdminId(adminId);
    if (!credentials) {
      return res.json({ credentials: null });
    }
    res.json({ credentials });
  } catch (error) {
    console.error("Get credentials error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};
const handleRemoveCredentials = async (req, res) => {
  try {
    const adminId = req.userId;
    await storage.removeTwilioCredentials(adminId);
    res.json({ success: true });
  } catch (error) {
    console.error("Remove credentials error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};
const handleGetNumbers = async (req, res) => {
  try {
    const adminId = req.userId;
    const numbers = await storage.getPhoneNumbersByAdminId(adminId);
    res.json({ numbers });
  } catch (error) {
    console.error("Get numbers error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};
const handleSetActiveNumber = async (req, res) => {
  try {
    const adminId = req.userId;
    const { phoneNumberId } = req.body;
    if (!phoneNumberId) {
      return res.status(400).json({ error: "Phone number ID is required" });
    }
    const numbers = await storage.getPhoneNumbersByAdminId(adminId);
    const phoneNumber = numbers.find((n) => n.id === phoneNumberId);
    if (!phoneNumber) {
      return res.status(404).json({ error: "Phone number not found" });
    }
    for (const number of numbers) {
      await storage.updatePhoneNumber({
        ...number,
        active: number.id === phoneNumberId
      });
    }
    res.json({ number: { ...phoneNumber, active: true } });
  } catch (error) {
    console.error("Set active number error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};
const handleGetTeamMembers = async (req, res) => {
  try {
    const adminId = req.userId;
    const members = await storage.getTeamMembersByAdminId(adminId);
    res.json({ members });
  } catch (error) {
    console.error("Get team members error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};
const handleInviteTeamMember = async (req, res) => {
  try {
    const adminId = req.userId;
    const { email, name, password } = req.body;
    if (!email || !name || !password) {
      return res.status(400).json({ error: "Missing required fields" });
    }
    const existingTeamMembers = await storage.getTeamMembersByAdminId(adminId);
    if (existingTeamMembers.some(
      (member) => member.email.toLowerCase() === email.toLowerCase()
    )) {
      return res.status(400).json({ error: "This team member already exists in your team" });
    }
    const userId = storage.generateId();
    const hashedPassword = hashPassword(password);
    const user = {
      id: userId,
      email,
      name,
      password: hashedPassword,
      role: "team_member",
      adminId,
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    await storage.createUser(user);
    const teamMember = {
      id: userId,
      email,
      name,
      password: hashedPassword,
      adminId,
      status: "active",
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    await storage.addTeamMember(teamMember);
    const userResponse = {
      id: userId,
      email,
      name,
      role: "team_member",
      adminId,
      createdAt: user.createdAt
    };
    res.json({ user: userResponse });
  } catch (error) {
    console.error("Invite team member error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};
const handleRemoveTeamMember = async (req, res) => {
  try {
    const adminId = req.userId;
    const { memberId } = req.params;
    if (!memberId) {
      return res.status(400).json({ error: "Member ID is required" });
    }
    const member = await storage.getTeamMemberById(memberId);
    if (!member || member.adminId !== adminId) {
      return res.status(403).json({ error: "Unauthorized" });
    }
    await storage.removeTeamMember(memberId);
    res.json({ success: true });
  } catch (error) {
    console.error("Remove team member error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};
const handleAddExistingNumber = async (req, res) => {
  try {
    const adminId = req.userId;
    const { phoneNumber } = req.body;
    if (!phoneNumber) {
      return res.status(400).json({ error: "Phone number is required" });
    }
    const cleanNumber = phoneNumber.replace(/\D/g, "");
    if (cleanNumber.length < 10) {
      return res.status(400).json({
        error: "Invalid phone number format"
      });
    }
    const existingNumbers = await storage.getPhoneNumbersByAdminId(adminId);
    if (existingNumbers.some((n) => n.phoneNumber === phoneNumber)) {
      return res.status(400).json({
        error: "This number is already in your account"
      });
    }
    const newPhoneNumber = {
      id: storage.generateId(),
      adminId,
      phoneNumber,
      purchasedAt: (/* @__PURE__ */ new Date()).toISOString(),
      active: true
    };
    await storage.addPhoneNumber(newPhoneNumber);
    res.json({ phoneNumber: newPhoneNumber });
  } catch (error) {
    console.error("Add existing number error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};
const handleAssignNumber = async (req, res) => {
  try {
    const adminId = req.userId;
    const { phoneNumberId, teamMemberId } = req.body;
    if (!phoneNumberId) {
      return res.status(400).json({ error: "Phone number ID is required" });
    }
    const numbers = await storage.getPhoneNumbersByAdminId(adminId);
    const phoneNumber = numbers.find((n) => n.id === phoneNumberId);
    if (!phoneNumber) {
      return res.status(404).json({ error: "Phone number not found" });
    }
    if (teamMemberId) {
      const members = await storage.getTeamMembersByAdminId(adminId);
      const member = members.find((m) => m.id === teamMemberId);
      if (!member) {
        return res.status(404).json({ error: "Team member not found" });
      }
    }
    const updatedNumber = {
      ...phoneNumber,
      assignedTo: teamMemberId
    };
    await storage.updatePhoneNumber(updatedNumber);
    res.json({ phoneNumber: updatedNumber });
  } catch (error) {
    console.error("Assign number error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};
const handleUpdateNumberSettings = async (req, res) => {
  try {
    const adminId = req.userId;
    const { phoneNumberId, active } = req.body;
    if (!phoneNumberId) {
      return res.status(400).json({ error: "Phone number ID is required" });
    }
    if (typeof active !== "boolean") {
      return res.status(400).json({ error: "Active status is required" });
    }
    const numbers = await storage.getPhoneNumbersByAdminId(adminId);
    const phoneNumber = numbers.find((n) => n.id === phoneNumberId);
    if (!phoneNumber) {
      return res.status(404).json({ error: "Phone number not found" });
    }
    const updatedNumber = {
      ...phoneNumber,
      active
    };
    await storage.updatePhoneNumber(updatedNumber);
    res.json({ phoneNumber: updatedNumber });
  } catch (error) {
    console.error("Update number settings error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};
const handleGetDashboardStats = async (req, res) => {
  try {
    const adminId = req.userId;
    const [numbers, teamMembers] = await Promise.all([
      storage.getPhoneNumbersByAdminId(adminId),
      storage.getTeamMembersByAdminId(adminId)
    ]);
    const activeNumbers = numbers.filter((n) => n.active).length;
    res.json({
      stats: {
        activeNumbers,
        teamMembersCount: teamMembers.length,
        teamMembers: teamMembers.map((member) => ({
          id: member.id,
          name: member.name,
          email: member.email,
          createdAt: member.createdAt,
          status: member.status
        }))
      }
    });
  } catch (error) {
    console.error("Get dashboard stats error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};
const handleGetWallet = async (req, res) => {
  try {
    const adminId = req.userId;
    const wallet = await storage.getOrCreateWallet(adminId);
    res.json({ wallet });
  } catch (error) {
    console.error("Get wallet error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};
const handleAddFunds = async (req, res) => {
  try {
    const adminId = req.userId;
    const { amount } = req.body;
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: "Invalid amount" });
    }
    const wallet = await storage.getOrCreateWallet(adminId);
    const newBalance = wallet.balance + amount;
    await storage.updateWalletBalance(adminId, newBalance);
    const transaction = {
      id: storage.generateId(),
      adminId,
      type: "credit",
      amount,
      description: "Wallet fund added",
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    await storage.addWalletTransaction(transaction);
    const updatedWallet = await storage.getWallet(adminId);
    res.json({ wallet: updatedWallet });
  } catch (error) {
    console.error("Add funds error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};
const handleGetTransactions = async (req, res) => {
  try {
    const adminId = req.userId;
    const transactions = await storage.getWalletTransactions(adminId);
    res.json({ transactions });
  } catch (error) {
    console.error("Get transactions error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};
class TwilioClient {
  accountSid;
  authToken;
  constructor(accountSid, authToken) {
    this.accountSid = accountSid;
    this.authToken = authToken;
  }
  /**
   * Send an SMS message through Twilio
   */
  async sendSMS(to, from, body) {
    return new Promise((resolve, reject) => {
      const auth = Buffer.from(`${this.accountSid}:${this.authToken}`).toString(
        "base64"
      );
      const postData = new URLSearchParams({
        To: to,
        From: from,
        Body: body
      }).toString();
      const options = {
        hostname: "api.twilio.com",
        path: `/2010-04-01/Accounts/${this.accountSid}/Messages.json`,
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded",
          "Content-Length": Buffer.byteLength(postData)
        }
      };
      const req = https.request(options, (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          try {
            const response = JSON.parse(data);
            resolve(response);
          } catch (error) {
            reject(error);
          }
        });
      });
      req.on("error", (error) => {
        reject(error);
      });
      req.write(postData);
      req.end();
    });
  }
  /**
   * Get available phone numbers from Twilio
   * @param countryCode - ISO country code (US, CA, GB, AU, etc)
   * @param areaCodeIndex - Which area code to use (0, 1, 2, etc) for fallback
   * @param state - State/region code (e.g., CA, NY, BC, ON)
   */
  async getAvailableNumbers(countryCode = "US", areaCodeIndex = 0, state) {
    return new Promise((resolve, reject) => {
      const auth = Buffer.from(`${this.accountSid}:${this.authToken}`).toString(
        "base64"
      );
      const US_STATE_AREA_CODES = {
        AL: ["205", "251", "334"],
        AK: ["907"],
        AZ: ["480", "602", "623", "928"],
        AR: ["479", "501", "870"],
        CA: [
          "209",
          "213",
          "310",
          "323",
          "408",
          "415",
          "510",
          "530",
          "559",
          "619",
          "626",
          "650",
          "661",
          "707",
          "714",
          "760",
          "805",
          "818",
          "831",
          "858",
          "916",
          "925",
          "949"
        ],
        CO: ["303", "719", "720", "970"],
        CT: ["203", "475", "860"],
        DE: ["302"],
        FL: [
          "239",
          "305",
          "321",
          "352",
          "386",
          "407",
          "561",
          "727",
          "772",
          "813",
          "850",
          "863",
          "904",
          "941"
        ],
        GA: ["229", "404", "470", "478", "678", "706", "770", "912"],
        HI: ["808"],
        ID: ["208"],
        IL: [
          "217",
          "224",
          "309",
          "312",
          "331",
          "618",
          "630",
          "708",
          "773",
          "815"
        ],
        IN: ["219", "260", "317", "463", "574", "765", "812", "930"],
        IA: ["319", "515", "563", "641", "712"],
        KS: ["316", "620", "785", "913"],
        KY: ["270", "364", "502", "606", "859"],
        LA: ["225", "318", "337", "504", "985"],
        ME: ["207"],
        MD: ["240", "301", "410", "667"],
        MA: ["339", "351", "413", "508", "617", "774", "781", "857"],
        MI: [
          "231",
          "248",
          "269",
          "313",
          "517",
          "586",
          "616",
          "734",
          "810",
          "906",
          "989"
        ],
        MN: ["218", "320", "507", "612", "651", "763", "952"],
        MS: ["228", "601", "662"],
        MO: ["314", "417", "573", "636", "660", "816", "975"],
        MT: ["406"],
        NE: ["308", "402", "531"],
        NV: ["702", "725", "775"],
        NH: ["603"],
        NJ: ["201", "609", "732", "856", "908", "973"],
        NM: ["505", "575"],
        NY: [
          "212",
          "315",
          "347",
          "516",
          "518",
          "585",
          "607",
          "631",
          "716",
          "718",
          "845",
          "914"
        ],
        NC: ["252", "336", "704", "828", "910", "919", "980"],
        ND: ["701"],
        OH: [
          "216",
          "220",
          "330",
          "380",
          "419",
          "440",
          "513",
          "567",
          "614",
          "740",
          "937"
        ],
        OK: ["405", "539", "580", "918"],
        OR: ["503", "541", "971"],
        PA: ["215", "267", "412", "484", "570", "610", "717", "724", "814"],
        RI: ["401"],
        SC: ["803", "843", "864"],
        SD: ["605"],
        TN: ["423", "615", "731", "865"],
        TX: [
          "210",
          "214",
          "254",
          "281",
          "325",
          "361",
          "409",
          "430",
          "432",
          "469",
          "512",
          "620",
          "682",
          "713",
          "737",
          "806",
          "817",
          "830",
          "903",
          "915",
          "936",
          "940",
          "956",
          "972",
          "979"
        ],
        UT: ["385", "435", "801"],
        VT: ["802"],
        VA: ["276", "434", "540", "571", "703", "757", "804"],
        WA: ["206", "253", "360", "425", "509"],
        WV: ["304"],
        WI: ["262", "414", "534", "608", "715", "920"],
        WY: ["307"]
      };
      const CA_PROVINCE_AREA_CODES = {
        AB: ["403", "587", "780", "825"],
        BC: ["236", "250", "604", "672", "778"],
        MB: ["204", "431"],
        NB: ["506"],
        NL: ["709"],
        NS: ["902", "782"],
        ON: [
          "226",
          "249",
          "289",
          "343",
          "365",
          "416",
          "437",
          "519",
          "613",
          "647",
          "705",
          "807",
          "905"
        ],
        PE: ["902"],
        QC: ["226", "438", "450", "514", "579", "581", "819", "873"],
        SK: ["306", "639"]
      };
      const query = new URLSearchParams();
      if (countryCode === "US") {
        let areaCodes = [];
        if (state && US_STATE_AREA_CODES[state]) {
          areaCodes = US_STATE_AREA_CODES[state];
        } else {
          areaCodes = ["415", "310"];
        }
        const areaCode = areaCodes[Math.min(areaCodeIndex, areaCodes.length - 1)];
        query.append("AreaCode", areaCode);
      } else if (countryCode === "CA") {
        let areaCodes = [];
        if (state && CA_PROVINCE_AREA_CODES[state]) {
          areaCodes = CA_PROVINCE_AREA_CODES[state];
        } else {
          areaCodes = ["604", "416"];
        }
        const areaCode = areaCodes[Math.min(areaCodeIndex, areaCodes.length - 1)];
        query.append("AreaCode", areaCode);
      } else if (countryCode === "AU") {
        const AU_STATE_COORDS = {
          NSW: { lat: "-33.8688", lng: "151.2093" },
          // Sydney
          VIC: { lat: "-37.8136", lng: "144.9631" },
          // Melbourne
          QLD: { lat: "-27.4698", lng: "153.0251" },
          // Brisbane
          WA: { lat: "-31.9505", lng: "115.8605" },
          // Perth
          SA: { lat: "-34.9285", lng: "138.6007" },
          // Adelaide
          TAS: { lat: "-42.8821", lng: "147.3272" },
          // Hobart
          ACT: { lat: "-35.2809", lng: "149.1300" },
          // Canberra
          NT: { lat: "-12.4634", lng: "130.8456" }
          // Darwin
        };
        let coords = AU_STATE_COORDS.NSW;
        if (state && AU_STATE_COORDS[state]) {
          coords = AU_STATE_COORDS[state];
        }
        query.append("NearLatLong", `${coords.lat},${coords.lng}`);
        query.append("Distance", areaCodeIndex > 0 ? "100" : "50");
      } else if (countryCode === "GB") {
        query.append("NearLatLong", "51.5074,-0.1278");
        query.append("Distance", areaCodeIndex > 0 ? "100" : "50");
      } else if (countryCode === "DE") {
        query.append("NearLatLong", "52.5200,13.4050");
        query.append("Distance", areaCodeIndex > 0 ? "100" : "50");
      } else if (countryCode === "FR") {
        query.append("NearLatLong", "48.8566,2.3522");
        query.append("Distance", areaCodeIndex > 0 ? "100" : "50");
      } else if (countryCode === "ES") {
        query.append("NearLatLong", "40.4168,-3.7038");
        query.append("Distance", areaCodeIndex > 0 ? "100" : "50");
      } else {
        const areaCodes = ["415", "310"];
        const areaCode = areaCodes[Math.min(areaCodeIndex, areaCodes.length - 1)];
        query.append("AreaCode", areaCode);
      }
      query.append("Limit", "50");
      const options = {
        hostname: "api.twilio.com",
        path: `/2010-04-01/Accounts/${this.accountSid}/AvailablePhoneNumbers/${countryCode}/Local.json?${query.toString()}`,
        method: "GET",
        headers: {
          Authorization: `Basic ${auth}`
        }
      };
      const req = https.request(options, (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          try {
            const response = JSON.parse(data);
            if (res.statusCode && res.statusCode >= 400) {
              return resolve({
                error: response.code || response.message || "Twilio API error",
                error_message: response.message || `HTTP ${res.statusCode}: ${response.detail || "Error"}`,
                status_code: res.statusCode
              });
            }
            resolve(response);
          } catch (error) {
            reject(error);
          }
        });
      });
      req.on("error", (error) => {
        reject(error);
      });
      req.end();
    });
  }
  /**
   * Purchase a phone number from Twilio
   */
  async purchasePhoneNumber(phoneNumber) {
    return new Promise((resolve, reject) => {
      const auth = Buffer.from(`${this.accountSid}:${this.authToken}`).toString(
        "base64"
      );
      const postData = new URLSearchParams({
        PhoneNumber: phoneNumber
      }).toString();
      const options = {
        hostname: "api.twilio.com",
        path: `/2010-04-01/Accounts/${this.accountSid}/IncomingPhoneNumbers.json`,
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded",
          "Content-Length": Buffer.byteLength(postData)
        }
      };
      const req = https.request(options, (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          try {
            const response = JSON.parse(data);
            resolve(response);
          } catch (error) {
            reject(error);
          }
        });
      });
      req.on("error", (error) => {
        reject(error);
      });
      req.write(postData);
      req.end();
    });
  }
}
const COUNTRY_CODES = {
  US: { code: "US", name: "United States" },
  CA: { code: "CA", name: "Canada" },
  GB: { code: "GB", name: "United Kingdom" },
  AU: { code: "AU", name: "Australia" },
  DE: { code: "DE", name: "Germany" },
  ES: { code: "ES", name: "Spain" },
  FR: { code: "FR", name: "France" }
};
const handleGetAvailableNumbers = async (req, res) => {
  try {
    const adminId = req.userId;
    const { countryCode, state } = req.query;
    if (!countryCode || !COUNTRY_CODES[countryCode]) {
      return res.status(400).json({ error: "Invalid country code" });
    }
    const credentials = await storage.getTwilioCredentialsByAdminId(adminId);
    if (!credentials) {
      return res.status(400).json({ error: "Please connect your Twilio credentials first" });
    }
    let availableNumbers = null;
    let areaCodeIndex = 0;
    const maxRetries = 5;
    for (areaCodeIndex = 0; areaCodeIndex < maxRetries; areaCodeIndex++) {
      const twilioClient = new TwilioClient(
        credentials.accountSid,
        credentials.authToken
      );
      availableNumbers = await twilioClient.getAvailableNumbers(
        countryCode,
        areaCodeIndex,
        state
      );
      if (availableNumbers.available_phone_numbers && availableNumbers.available_phone_numbers.length > 0) {
        console.log(
          `Found ${availableNumbers.available_phone_numbers.length} numbers for ${countryCode}/${state} using area code index ${areaCodeIndex}`
        );
        break;
      }
      if (availableNumbers.error || availableNumbers.error_message) {
        console.warn(
          `API error on retry ${areaCodeIndex}: ${availableNumbers.error_message}`
        );
        break;
      }
      console.log(
        `No numbers found for ${countryCode}/${state} with area code index ${areaCodeIndex}, retrying...`
      );
    }
    if (availableNumbers.error || availableNumbers.error_message) {
      console.error("Twilio API error:", availableNumbers);
      return res.status(400).json({
        error: availableNumbers.error_message || availableNumbers.error || "Failed to fetch numbers from Twilio"
      });
    }
    if (!availableNumbers || !availableNumbers.available_phone_numbers || !Array.isArray(availableNumbers.available_phone_numbers)) {
      console.warn(
        "No phone numbers available for country:",
        countryCode,
        "Response:",
        availableNumbers
      );
      return res.json({ numbers: [] });
    }
    const allNumbers = [];
    for (const region of availableNumbers.available_phone_numbers) {
      const parseCapabilities = (caps) => {
        if (Array.isArray(caps)) {
          return {
            SMS: caps.includes("SMS"),
            MMS: caps.includes("MMS"),
            voice: caps.includes("Voice"),
            fax: caps.includes("Fax")
          };
        } else if (typeof caps === "object" && caps !== null) {
          return {
            SMS: caps.SMS === true,
            MMS: caps.MMS === true,
            voice: caps.voice === true || caps.Voice === true,
            fax: caps.fax === true || caps.Fax === true
          };
        }
        return { SMS: false, MMS: false, voice: false, fax: false };
      };
      if (region.phone_number) {
        const caps = parseCapabilities(region.capabilities);
        allNumbers.push({
          phoneNumber: region.phone_number,
          friendlyName: region.friendly_name || region.phone_number,
          locality: region.locality || "",
          region: region.region || "",
          postalCode: region.postal_code || "",
          countryCode,
          cost: region.price || "1.00",
          capabilities: caps
        });
      } else if (region.available_phone_numbers && Array.isArray(region.available_phone_numbers)) {
        const regionNumbers = region.available_phone_numbers.map((num) => {
          const caps = parseCapabilities(num.capabilities);
          return {
            phoneNumber: num.phone_number,
            friendlyName: num.friendly_name || num.phone_number,
            locality: num.locality || "",
            region: num.region || "",
            postalCode: num.postal_code || "",
            countryCode,
            cost: num.price || "1.00",
            capabilities: caps
          };
        });
        allNumbers.push(...regionNumbers);
      }
    }
    if (allNumbers.length === 0) {
      console.warn("No phone numbers found for country:", countryCode);
    }
    let filteredNumbers = allNumbers;
    if (state) {
      const STATE_REGION_MAP = {
        // US states - use state abbreviation
        AL: ["AL"],
        AK: ["AK"],
        AZ: ["AZ"],
        AR: ["AR"],
        CA: ["CA"],
        CO: ["CO"],
        CT: ["CT"],
        DE: ["DE"],
        FL: ["FL"],
        GA: ["GA"],
        HI: ["HI"],
        ID: ["ID"],
        IL: ["IL"],
        IN: ["IN"],
        IA: ["IA"],
        KS: ["KS"],
        KY: ["KY"],
        LA: ["LA"],
        ME: ["ME"],
        MD: ["MD"],
        MA: ["MA"],
        MI: ["MI"],
        MN: ["MN"],
        MS: ["MS"],
        MO: ["MO"],
        MT: ["MT"],
        NE: ["NE"],
        NV: ["NV"],
        NH: ["NH"],
        NJ: ["NJ"],
        NM: ["NM"],
        NY: ["NY"],
        NC: ["NC"],
        ND: ["ND"],
        OH: ["OH"],
        OK: ["OK"],
        OR: ["OR"],
        PA: ["PA"],
        RI: ["RI"],
        SC: ["SC"],
        SD: ["SD"],
        TN: ["TN"],
        TX: ["TX"],
        UT: ["UT"],
        VT: ["VT"],
        VA: ["VA"],
        WA: ["WA"],
        WV: ["WV"],
        WI: ["WI"],
        WY: ["WY"],
        // Canadian provinces
        AB: ["AB", "Alberta"],
        BC: ["BC", "British Columbia"],
        MB: ["MB", "Manitoba"],
        NB: ["NB", "New Brunswick"],
        NL: ["NL", "Newfoundland and Labrador"],
        NS: ["NS", "Nova Scotia"],
        ON: ["ON", "Ontario"],
        PE: ["PE", "Prince Edward Island"],
        QC: ["QC", "Quebec"],
        SK: ["SK", "Saskatchewan"]
      };
      const regionCodes = STATE_REGION_MAP[state] || [state];
      filteredNumbers = allNumbers.filter((num) => {
        if (countryCode === "US" || countryCode === "CA") {
          const numberRegion = num.region?.toUpperCase() || "";
          return regionCodes.some((code) => numberRegion.includes(code));
        }
        return true;
      });
      console.log(
        `Filtered ${allNumbers.length} numbers to ${filteredNumbers.length} for state ${state}`
      );
    }
    res.json({ numbers: filteredNumbers });
  } catch (error) {
    console.error("Get available numbers error:", error);
    const errorMessage = error instanceof Error ? error.message : "Failed to fetch available numbers";
    res.status(500).json({
      error: errorMessage,
      details: "Please ensure your Twilio credentials are valid"
    });
  }
};
const handlePurchaseNumber = async (req, res) => {
  try {
    const adminId = req.userId;
    const { phoneNumber, cost } = req.body;
    if (!phoneNumber || cost === void 0) {
      return res.status(400).json({ error: "Missing required fields" });
    }
    const numbers = await storage.getPhoneNumbersByAdminId(adminId);
    if (numbers.some((n) => n.phoneNumber === phoneNumber)) {
      return res.status(400).json({ error: "This number is already purchased by you" });
    }
    const wallet = await storage.getOrCreateWallet(adminId);
    if (wallet.balance < cost) {
      return res.status(400).json({ error: "Insufficient wallet balance" });
    }
    const credentials = await storage.getTwilioCredentialsByAdminId(adminId);
    if (!credentials) {
      return res.status(400).json({ error: "Please connect your Twilio credentials first" });
    }
    const twilioClient = new TwilioClient(
      credentials.accountSid,
      credentials.authToken
    );
    const purchaseResponse = await twilioClient.purchasePhoneNumber(phoneNumber);
    if (purchaseResponse.error || purchaseResponse.error_message) {
      return res.status(400).json({
        error: purchaseResponse.error_message || purchaseResponse.error
      });
    }
    const newBalance = wallet.balance - cost;
    await storage.updateWalletBalance(adminId, newBalance);
    await storage.addWalletTransaction({
      id: storage.generateId(),
      adminId,
      type: "debit",
      amount: cost,
      description: `Phone number purchased: ${phoneNumber}`,
      reference: phoneNumber,
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    });
    const newPhoneNumber = {
      id: storage.generateId(),
      adminId,
      phoneNumber,
      purchasedAt: (/* @__PURE__ */ new Date()).toISOString(),
      active: true
    };
    await storage.addPhoneNumber(newPhoneNumber);
    res.json({ phoneNumber: newPhoneNumber, wallet: { balance: newBalance } });
  } catch (error) {
    console.error("Purchase number error:", error);
    res.status(500).json({ error: "Failed to purchase number" });
  }
};
const handleGetAssignedPhoneNumber = async (req, res) => {
  try {
    const userId = req.userId;
    const user = await storage.getUserById(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    let adminId = userId;
    if (user.role === "team_member" && user.adminId) {
      adminId = user.adminId;
    }
    const allPhoneNumbers = await storage.getPhoneNumbersByAdminId(adminId);
    const assignedPhoneNumbers = allPhoneNumbers.filter(
      (pn) => pn.assignedTo === userId
    );
    res.json({ phoneNumbers: assignedPhoneNumbers });
  } catch (error) {
    console.error("Get assigned phone number error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};
const handleGetContacts = async (req, res) => {
  try {
    const userId = req.userId;
    const { phoneNumberId } = req.query;
    const user = await storage.getUserById(userId);
    let adminId = userId;
    if (user?.role === "team_member" && user.adminId) {
      adminId = user.adminId;
    }
    if (!phoneNumberId) {
      return res.status(400).json({ error: "Phone number ID is required" });
    }
    const phoneNumber = await storage.getPhoneNumberById(
      phoneNumberId
    );
    if (!phoneNumber) {
      return res.status(404).json({ error: "Phone number not found" });
    }
    if (phoneNumber.adminId !== adminId) {
      return res.status(403).json({ error: "Unauthorized" });
    }
    if (user?.role === "team_member" && phoneNumber.assignedTo !== userId) {
      return res.status(403).json({ error: "This number is not assigned to you" });
    }
    const phoneContacts = await storage.getContactsByPhoneNumber(
      phoneNumberId
    );
    const contactsWithIds = phoneContacts.map((contact) => {
      if (!contact.id) {
        console.warn("Contact missing ID:", contact);
        contact.id = `contact-${Math.random().toString(36).substr(2, 9)}`;
      }
      return contact;
    });
    console.log(
      `Returning ${contactsWithIds.length} contacts for phone number ${phoneNumberId}`
    );
    res.json({ contacts: contactsWithIds });
  } catch (error) {
    console.error("Get contacts error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};
const handleGetConversation = async (req, res) => {
  try {
    const { contactId } = req.params;
    console.log("Looking for contact with ID:", contactId);
    const contact = await storage.getContactById(contactId);
    if (!contact) {
      console.warn("Contact not found with ID:", contactId);
      return res.status(404).json({
        error: "Contact not found",
        contactId
      });
    }
    console.log("Found contact:", contact.phoneNumber);
    const messages = await storage.getMessagesByPhoneNumber(
      contact.phoneNumberId
    );
    const conversation = messages.filter(
      (m) => m.from === contact.phoneNumber || m.to === contact.phoneNumber
    );
    res.json({ messages: conversation });
  } catch (error) {
    console.error("Get conversation error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};
const handleSendMessage = async (req, res) => {
  try {
    const userId = req.userId;
    const { to, body, phoneNumberId } = req.body;
    if (!to || !body || !phoneNumberId) {
      return res.status(400).json({ error: "Missing required fields" });
    }
    const phoneNumber = await storage.getPhoneNumberById(phoneNumberId);
    if (!phoneNumber) {
      return res.status(404).json({ error: "Phone number not found" });
    }
    const user = await storage.getUserById(userId);
    let adminId = userId;
    if (user?.role === "team_member" && user.adminId) {
      adminId = user.adminId;
    }
    if (phoneNumber.adminId !== adminId) {
      return res.status(403).json({ error: "Unauthorized to use this phone number" });
    }
    const credentials = await storage.getTwilioCredentialsByAdminId(adminId);
    if (!credentials) {
      return res.status(400).json({
        error: "Twilio credentials not connected. Please have the admin connect their credentials first."
      });
    }
    const twilioClient = new TwilioClient(
      credentials.accountSid,
      credentials.authToken
    );
    const twilioResponse = await twilioClient.sendSMS(
      to,
      phoneNumber.phoneNumber,
      body
    );
    if (twilioResponse.error || twilioResponse.error_message) {
      return res.status(400).json({ error: twilioResponse.error_message || twilioResponse.error });
    }
    const message = {
      id: Math.random().toString(36).substr(2, 9),
      phoneNumberId,
      from: phoneNumber.phoneNumber,
      to,
      body,
      direction: "outbound",
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      sid: twilioResponse.sid
    };
    await storage.addMessage(message);
    const existingContact = (await storage.getContactsByPhoneNumber(phoneNumberId)).find((c) => c.phoneNumber === to);
    if (!existingContact) {
      const contact = {
        id: Math.random().toString(36).substr(2, 9),
        phoneNumberId,
        phoneNumber: to,
        unreadCount: 0
      };
      await storage.addContact(contact);
    } else {
      await storage.updateContact({
        ...existingContact,
        lastMessage: body.substring(0, 50),
        lastMessageTime: message.timestamp
      });
    }
    res.json({ message });
  } catch (error) {
    console.error("Send message error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};
const handleMarkAsRead = async (req, res) => {
  try {
    const { contactId } = req.params;
    const contact = await storage.getContactById(contactId);
    if (!contact) {
      return res.status(404).json({ error: "Contact not found" });
    }
    await storage.updateContact({
      ...contact,
      unreadCount: 0
    });
    res.json({ success: true });
  } catch (error) {
    console.error("Mark as read error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};
const handleAddContact = async (req, res) => {
  try {
    const userId = req.userId;
    const { name, phoneNumber, phoneNumberId } = req.body;
    if (!phoneNumber || !phoneNumberId) {
      return res.status(400).json({ error: "Phone number and phone number ID are required" });
    }
    const user = await storage.getUserById(userId);
    let adminId = userId;
    if (user?.role === "team_member" && user.adminId) {
      adminId = user.adminId;
    }
    const phoneNum = await storage.getPhoneNumberById(phoneNumberId);
    if (!phoneNum || phoneNum.adminId !== adminId) {
      return res.status(403).json({ error: "Unauthorized" });
    }
    const existingContacts = await storage.getContactsByPhoneNumber(phoneNumberId);
    if (existingContacts.some((c) => c.phoneNumber === phoneNumber)) {
      return res.status(400).json({ error: "Contact already exists" });
    }
    const contact = {
      id: Math.random().toString(36).substr(2, 9),
      phoneNumberId,
      phoneNumber,
      name: name || phoneNumber,
      unreadCount: 0
    };
    await storage.addContact(contact);
    res.json({ contact });
  } catch (error) {
    console.error("Add contact error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};
const handleUpdateContact = async (req, res) => {
  try {
    const { contactId } = req.params;
    const { name } = req.body;
    const contact = await storage.getContactById(contactId);
    if (!contact) {
      return res.status(404).json({ error: "Contact not found" });
    }
    const updatedContact = {
      ...contact,
      ...name && { name }
    };
    await storage.updateContact(updatedContact);
    res.json({ contact: updatedContact });
  } catch (error) {
    console.error("Update contact error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};
const handleDeleteContact = async (req, res) => {
  try {
    const { contactId } = req.params;
    const contact = await storage.getContactById(contactId);
    if (!contact) {
      return res.status(404).json({ error: "Contact not found" });
    }
    await storage.deleteContact(contactId);
    res.json({ success: true });
  } catch (error) {
    console.error("Delete contact error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};
const handleWebhookHealth = async (req, res) => {
  console.log("✅ Webhook health check - endpoint is reachable");
  res.json({ status: "ok", timestamp: (/* @__PURE__ */ new Date()).toISOString() });
};
const handleInboundSMS = async (req, res) => {
  console.log("\n\n🔔 ===== TWILIO WEBHOOK HIT ===== 🔔");
  console.log("⏰ Timestamp:", (/* @__PURE__ */ new Date()).toISOString());
  console.log("📤 Request Method:", req.method);
  console.log("📨 Full request body:", JSON.stringify(req.body, null, 2));
  console.log("🔔 ===== WEBHOOK RECEIVED ===== 🔔\n\n");
  try {
    const { From, To, Body, MessageSid } = req.body;
    if (!From || !To || !Body) {
      console.warn("Missing required fields in Twilio webhook:", {
        From,
        To,
        Body
      });
      return res.status(400).send("Missing required fields");
    }
    console.log(`✅ Received inbound SMS from ${From} to ${To}: ${Body}`);
    const phoneNumber = await storage.getPhoneNumberByPhoneNumber(To);
    if (!phoneNumber) {
      console.error(`❌ Phone number ${To} not found in database`);
      console.error(
        "This means the Twilio number hasn't been added to your account"
      );
      return res.status(404).send("Phone number not found");
    }
    console.log(
      `✅ Found phone number: ${phoneNumber.phoneNumber} (ID: ${phoneNumber.id})`
    );
    const message = {
      id: MessageSid || Math.random().toString(36).substr(2, 9),
      phoneNumberId: phoneNumber.id,
      from: From,
      to: To,
      body: Body,
      direction: "inbound",
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      sid: MessageSid
    };
    await storage.addMessage(message);
    console.log(`✅ Message saved to database: ${message.id}`);
    const contacts = await storage.getContactsByPhoneNumber(phoneNumber.id);
    const existingContact = contacts.find((c) => c.phoneNumber === From);
    let savedContact;
    if (!existingContact) {
      const contact = {
        id: Math.random().toString(36).substr(2, 9),
        phoneNumberId: phoneNumber.id,
        phoneNumber: From,
        lastMessage: Body.substring(0, 50),
        lastMessageTime: message.timestamp,
        unreadCount: 1
      };
      await storage.addContact(contact);
      savedContact = contact;
      console.log(`✅ New contact created: ${From}`);
    } else {
      const updatedContact = {
        ...existingContact,
        lastMessage: Body.substring(0, 50),
        lastMessageTime: message.timestamp,
        unreadCount: (existingContact.unreadCount || 0) + 1
      };
      await storage.updateContact(updatedContact);
      savedContact = updatedContact;
      console.log(
        `✅ Contact updated: ${From}, unread count: ${(existingContact.unreadCount || 0) + 1}`
      );
    }
    const io = getSocketIOInstance();
    if (io && phoneNumber.assignedTo) {
      console.log(
        `📡 Emitting socket.io event to user ${phoneNumber.assignedTo}`
      );
      io.to(`user:${phoneNumber.assignedTo}`).emit("new_message", {
        id: message.id,
        phoneNumberId: phoneNumber.id,
        from: From,
        to: To,
        body: Body,
        direction: "inbound",
        timestamp: message.timestamp,
        sid: MessageSid
      });
      io.to(`user:${phoneNumber.assignedTo}`).emit("contact_updated", {
        id: savedContact.id,
        phoneNumberId: savedContact.phoneNumberId,
        phoneNumber: savedContact.phoneNumber,
        name: savedContact.name,
        lastMessage: savedContact.lastMessage,
        lastMessageTime: savedContact.lastMessageTime,
        unreadCount: savedContact.unreadCount
      });
    } else if (io && phoneNumber.adminId) {
      console.log(`📡 No assignee, emitting to admin ${phoneNumber.adminId}`);
      io.to(`admin:${phoneNumber.adminId}`).emit("new_message", {
        id: message.id,
        phoneNumberId: phoneNumber.id,
        from: From,
        to: To,
        body: Body,
        direction: "inbound",
        timestamp: message.timestamp,
        sid: MessageSid
      });
      io.to(`admin:${phoneNumber.adminId}`).emit("contact_updated", {
        id: savedContact.id,
        phoneNumberId: savedContact.phoneNumberId,
        phoneNumber: savedContact.phoneNumber,
        name: savedContact.name,
        lastMessage: savedContact.lastMessage,
        lastMessageTime: savedContact.lastMessageTime,
        unreadCount: savedContact.unreadCount
      });
    } else {
      console.warn(`⚠️ No socket.io instance available or no assignee/admin`);
    }
    const twimlResponse = `<?xml version="1.0" encoding="UTF-8"?>
<Response></Response>`;
    console.log(`✅✅✅ WEBHOOK PROCESSED SUCCESSFULLY ✅✅✅`);
    res.type("application/xml").send(twimlResponse);
  } catch (error) {
    console.error("❌ Inbound SMS webhook error:", error);
    console.error("Error details:", {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : void 0
    });
    res.status(500).send("Internal server error");
  }
};
const authMiddleware = async (req, res, next) => {
  try {
    const token = extractTokenFromHeader(req.headers.authorization);
    if (!token) {
      return res.status(401).json({
        error: "Missing authorization token. Please login again.",
        code: "NO_TOKEN"
      });
    }
    const payload = verifyToken(token);
    if (!payload) {
      return res.status(401).json({
        error: "Your session has expired. Please login again.",
        code: "INVALID_TOKEN"
      });
    }
    let user;
    try {
      user = await storage.getUserById(payload.userId);
    } catch (dbError) {
      console.warn(
        `Database lookup failed for user ${payload.userId}, using token data:`,
        dbError
      );
    }
    if (!user) {
      user = {
        id: payload.userId,
        email: payload.email,
        name: payload.email.split("@")[0],
        role: payload.role,
        createdAt: (/* @__PURE__ */ new Date()).toISOString()
      };
    }
    req.userId = payload.userId;
    req.userRole = payload.role;
    req.user = user;
    next();
  } catch (error) {
    console.error("Auth middleware error:", error);
    res.status(401).json({
      error: "Authentication failed. Please login again.",
      code: "AUTH_ERROR"
    });
  }
};
const adminOnly = (req, res, next) => {
  if (req.userRole !== "admin") {
    return res.status(403).json({ error: "Only admins can access this" });
  }
  next();
};
const handleDemo = (req, res) => {
  const response = {
    message: "Hello from Express server"
  };
  res.status(200).json(response);
};
let globalIO = null;
function setSocketIOInstance(io) {
  globalIO = io;
}
function getSocketIOInstance() {
  return globalIO;
}
async function createServer() {
  await connectDB();
  const app = express__default();
  // ✅ Add CORS config here
  app.use(cors({
    origin: "https://smshub.netlify.app",   // tumhara Netlify frontend
    credentials: true
  }));

  function normalizeRouteString(route) {
    if (!route || typeof route !== "string") return route;
    try {
      if (route.startsWith("http://") || route.startsWith("https://")) {
        const u = new URL(route);
        return u.pathname || "/";
      }
    } catch (err) {
    }
    return route.replace(/^https?:\/\/[^/]+/, "") || "/";
  }
  const methodsToPatch = [
    "get",
    "post",
    "put",
    "delete",
    "patch",
    "options",
    "head",
    "all",
    "use"
  ];
  for (const method of methodsToPatch) {
    const original = app[method].bind(app);
    app[method] = (...args) => {
      if (typeof args[0] === "string") {
        args[0] = normalizeRouteString(args[0]);
      } else if (Array.isArray(args[0])) {
        args[0] = args[0].map(
          (r) => typeof r === "string" ? normalizeRouteString(r) : r
        );
      }
      return original(...args);
    };
  }
  app.use(cors());
  app.use(express__default.json());
  app.use(express__default.urlencoded({ extended: true }));
  app.get("/api/ping", (_req, res) => {
    const ping = process.env.PING_MESSAGE ?? "ping";
    res.json({ message: ping });
  });
  app.get("/api/demo", handleDemo);
  app.post("/api/auth/signup", handleSignup);
  app.post("/api/auth/login", handleLogin);
  app.get("/api/auth/profile", authMiddleware, handleGetProfile);
  app.get("/api/webhooks/inbound-sms", handleWebhookHealth);
  app.post("/api/webhooks/inbound-sms", handleInboundSMS);
  app.post(
    "/api/admin/credentials",
    authMiddleware,
    adminOnly,
    handleSaveCredentials
  );
  app.get(
    "/api/admin/credentials",
    authMiddleware,
    adminOnly,
    handleGetCredentials
  );
  app.delete(
    "/api/admin/credentials",
    authMiddleware,
    adminOnly,
    handleRemoveCredentials
  );
  app.get("/api/admin/numbers", authMiddleware, adminOnly, handleGetNumbers);
  app.post(
    "/api/admin/numbers/set-active",
    authMiddleware,
    adminOnly,
    handleSetActiveNumber
  );
  app.post(
    "/api/admin/add-existing-number",
    authMiddleware,
    adminOnly,
    handleAddExistingNumber
  );
  app.post(
    "/api/admin/assign-number",
    authMiddleware,
    adminOnly,
    handleAssignNumber
  );
  app.patch(
    "/api/admin/number-settings",
    authMiddleware,
    adminOnly,
    handleUpdateNumberSettings
  );
  app.get("/api/admin/team", authMiddleware, adminOnly, handleGetTeamMembers);
  app.post(
    "/api/admin/team/invite",
    authMiddleware,
    adminOnly,
    handleInviteTeamMember
  );
  app.delete(
    "/api/admin/team/:memberId",
    authMiddleware,
    adminOnly,
    handleRemoveTeamMember
  );
  app.get(
    "/api/admin/dashboard/stats",
    authMiddleware,
    adminOnly,
    handleGetDashboardStats
  );
  app.get("/api/messages/contacts", authMiddleware, handleGetContacts);
  app.get(
    "/api/messages/conversation/:contactId",
    authMiddleware,
    handleGetConversation
  );
  app.post("/api/messages/send", authMiddleware, handleSendMessage);
  app.post(
    "/api/messages/mark-read/:contactId",
    authMiddleware,
    handleMarkAsRead
  );
  app.post("/api/contacts", authMiddleware, handleAddContact);
  app.patch("/api/contacts/:contactId", authMiddleware, handleUpdateContact);
  app.delete("/api/contacts/:contactId", authMiddleware, handleDeleteContact);
  app.get(
    "/api/messages/assigned-phone-number",
    authMiddleware,
    handleGetAssignedPhoneNumber
  );
  app.get("/api/wallet", authMiddleware, handleGetWallet);
  app.post("/api/wallet/add-funds", authMiddleware, handleAddFunds);
  app.get("/api/wallet/transactions", authMiddleware, handleGetTransactions);
  app.get(
    "/api/admin/available-numbers",
    authMiddleware,
    adminOnly,
    handleGetAvailableNumbers
  );
  app.post(
    "/api/admin/purchase-number",
    authMiddleware,
    adminOnly,
    handlePurchaseNumber
  );
  return app;
}
function setupSocketIO(httpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: "https://smshub.netlify.app",   // ✅ tumhara Netlify frontend
      methods: ["GET", "POST"],
      credentials: true
    }
  });

  io.use((socket, next) => {
    try {
      const token = extractTokenFromHeader(socket.handshake.auth.authorization);
      if (!token) {
        return next(new Error("Missing authorization token"));
      }
      const payload = verifyToken(token);
      if (!payload) {
        return next(new Error("Invalid token"));
      }
      socket.userId = payload.userId;
      socket.userRole = payload.role;
      next();
    } catch (error) {
      next(new Error("Authentication failed"));
    }
  });
  io.on("connection", (socket) => {
    socket.join(`user:${socket.userId}`);
    if (socket.userRole === "admin") {
      socket.join(`admin:${socket.userId}`);
    }
    socket.on("incoming_sms", async (data) => {
      const { phoneNumberId, from, body } = data;
      try {
        const phoneNumber = await storage.getPhoneNumberById(phoneNumberId);
        if (phoneNumber?.assignedTo) {
          io.to(`user:${phoneNumber.assignedTo}`).emit("new_message", {
            phoneNumberId,
            from,
            body,
            direction: "inbound",
            timestamp: (/* @__PURE__ */ new Date()).toISOString()
          });
        }
        io.to(`admin:${phoneNumber?.adminId}`).emit(
          "incoming_sms_notification",
          {
            phoneNumberId,
            from,
            preview: body.substring(0, 50)
          }
        );
      } catch (error) {
        console.error("Error handling incoming SMS:", error);
      }
    });
    socket.on("message_sent", async (data) => {
      const { phoneNumberId, to, body } = data;
      try {
        io.to(`user:${socket.userId}`).emit("message_updated", {
          phoneNumberId,
          to,
          body,
          direction: "outbound",
          timestamp: (/* @__PURE__ */ new Date()).toISOString()
        });
      } catch (error) {
        console.error("Error handling message sent:", error);
      }
    });
    socket.on("disconnect", () => {
    });
  });
  return io;
}
async function startServer() {
  try {
    const app = await createServer();
    const httpServer = createServer$1(app);
    const io = setupSocketIO(httpServer);
    setSocketIOInstance(io);
    const port = process.env.PORT || 3e3;
    const __dirname = import.meta.dirname;
    const distPath = path.join(__dirname, "../spa");
    app.use(express.static(distPath));
    app.use((req, res) => {

      if (req.path.startsWith("/api/") || req.path.startsWith("/health")) {
        return res.status(404).json({ error: "API endpoint not found" });
      }
      res.sendFile(path.join(distPath, "index.html"));
    });
    httpServer.listen(port, () => {
      console.log(`🚀 SMSHub server running on port ${port}`);
      console.log(`📱 Frontend: https://smshub.netlify.app`);   // Netlify frontend
      console.log(`🔧 API: https://your-backend.onrender.com/api`); // Render backend URL
      console.log(`⚡ WebSocket: wss://your-backend.onrender.com`); // Render WebSocket URL
    });


    process.on("SIGTERM", () => {
      console.log("🛑 Received SIGTERM, shutting down gracefully");
      httpServer.close(() => {
        process.exit(0);
      });
    });
    process.on("SIGINT", () => {
      console.log("🛑 Received SIGINT, shutting down gracefully");
      httpServer.close(() => {
        process.exit(0);
      });
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}
startServer();
//# sourceMappingURL=node-build.mjs.map
