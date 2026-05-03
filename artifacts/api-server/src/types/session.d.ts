import "express-session";

declare module "express-session" {
  interface SessionData {
    doctorId: number;
    doctorName: string;
    doctorPhone: string;
  }
}
