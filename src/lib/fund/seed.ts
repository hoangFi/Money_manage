import type { DB } from "./types";

// Fake data for the demo. Usernames must match the Tide accounts created in the realm.
export function seed(): DB {
  const users = [
    { id: "u-an", username: "an", name: "An (thủ quỹ)" },
    { id: "u-binh", username: "binh", name: "Bình" },
    { id: "u-chi", username: "chi", name: "Chi" },
    { id: "u-dung", username: "dung", name: "Dũng" },
    { id: "u-em", username: "em", name: "Em" },

    { id: "u-lan", username: "lan", name: "Lan (người kêu gọi)" },
    { id: "u-hoa", username: "hoa", name: "Hoa (hội đồng)" },
    { id: "u-khoa", username: "khoa", name: "Khoa (hội đồng)" },
    { id: "u-minh", username: "minh", name: "Minh (hội đồng)" },
    { id: "u-nga", username: "nga", name: "Nga (hội đồng)" },
    { id: "u-phuc", username: "phuc", name: "Phúc (hội đồng)" },
    { id: "u-minhphat", username: "minhphat", name: "Cửa hàng VLXD Minh Phát" },
    { id: "u-hieutruong", username: "hieutruong", name: "Thầy Tùng (hiệu trưởng)" },
    { id: "u-donor1", username: "donor1", name: "Nhà hảo tâm Quang" },
    { id: "u-donor2", username: "donor2", name: "Nhà hảo tâm Thảo" },

    { id: "u-admin", username: "admin", name: "Admin nền tảng", platformAdmin: true },
  ];

  return {
    users,
    funds: [
      {
        id: "f-dalat",
        kind: "group",
        name: "Du lịch Đà Lạt",
        description: "Quỹ chung của 5 bạn cho chuyến đi Đà Lạt tháng 12.",
        balance: 15_000_000,
        members: [
          { userId: "u-an", role: "treasurer" },
          { userId: "u-binh", role: "member" },
          { userId: "u-chi", role: "member" },
          { userId: "u-dung", role: "member" },
          { userId: "u-em", role: "member" },
        ],
        rules: { quorum: 3 },
        recipients: [],
      },
      {
        id: "f-namcang",
        kind: "charity",
        name: "Xây lại lớp học cho điểm trường Nậm Cang",
        description: "Điểm trường bị lũ cuốn. Mục tiêu 200 triệu để xây lại 2 phòng học.",
        balance: 0,
        goal: 200_000_000,
        members: [
          { userId: "u-lan", role: "organiser" },
          { userId: "u-hoa", role: "council" },
          { userId: "u-khoa", role: "council" },
          { userId: "u-minh", role: "council" },
          { userId: "u-nga", role: "council" },
          { userId: "u-phuc", role: "council" },
          { userId: "u-minhphat", role: "recipient" },
          { userId: "u-hieutruong", role: "recipient" },
          { userId: "u-donor1", role: "donor" },
          { userId: "u-donor2", role: "donor" },
        ],
        rules: { quorum: 3, largeAmount: 50_000_000, evidenceBeforeNext: true },
        recipients: [
          { id: "r-minhphat", name: "Cửa hàng VLXD Minh Phát", account: "VCB 0011 2233 4455", userId: "u-minhphat" },
          { id: "r-truong", name: "Điểm trường Nậm Cang", account: "Agribank 7788 9900 1122", userId: "u-hieutruong" },
        ],
      },
    ],
    payouts: [],
    ruleChanges: [],
    contributions: [],
    log: [],
    bank: [],
  };
}
