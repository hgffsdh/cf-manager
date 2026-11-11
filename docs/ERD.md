# ERD rút gọn — MVP

```mermaid
erDiagram
    Branch ||--o{ Area : includes
    Area ||--o{ Hut : contains
    Hut ||--o{ CafeTable : seats
    Branch ||--o{ CafeTable : owns
    CafeTable ||--o{ TableQrToken : secures
    CafeTable ||--o{ VisitSession : visits
    VisitSession ||--o{ GuestSession : joins
    VisitSession ||--o{ CafeOrder : creates
    GuestSession ||--o{ CafeOrder : submits
    Category ||--o{ Product : has
    PreparationStation ||--o{ Product : prepares
    Product ||--o{ ProductVariant : sizes
    Product ||--o{ ProductModifierGroup : allows
    ModifierGroup ||--o{ ProductModifierGroup : assigned
    ModifierGroup ||--o{ ModifierOption : options
    CafeOrder ||--o{ OrderItem : contains
    OrderItem ||--o{ OrderItemModifier : snapshots
    OrderItem ||--o| PreparationTask : allocated
    CafeOrder ||--o{ PaymentAttempt : tries
    PaymentAttempt ||--o| Payment : completes
    Payment ||--o{ PaymentAllocation : allocates
    CafeOrder ||--o{ PaymentAllocation : covered
    VisitSession ||--o{ ServiceRequest : requests
    Ingredient ||--o{ InventoryMovement : moves
    CafeTable ||--o{ Reservation : reserves
```

Các entity EF Core trong `backend/MocCafe.Api/Domain/Entities.cs`; mapping precision, unique index, rowversion trong `Data/CafeDbContext.cs`. SQL Server sinh bảng qua EF migration do `scripts/setup-windows.ps1` tạo ở lần khởi tạo đầu tiên.

## Trạng thái

```mermaid
flowchart LR
  P[Pending] -->|Manager accept| A[Accepted]
  P -->|Reject| R[Rejected]
  A --> Q[Queued]
  Q --> W[Preparing]
  W --> PR[PartiallyReady]
  PR --> D[Ready]
  W --> D
  D --> PS[PartiallyServed]
  PS --> S[Served]
  D --> S
```

Thanh toán **độc lập** với pha chế: `Unpaid/Pending → Paid` (hoặc `Failed` ở PaymentAttempt demo), không tự phục vụ món khi đã Paid.

## Giới hạn kiến trúc cần khắc phục

- Reservation dùng SQL Server Serializable transaction và index (chưa test stress/phantom).
- Đơn giá có snapshot nhưng chưa khóa quote server trong thời gian ngắn và chưa áp dụng khuyến mãi.
- Outbox worker hiện xử lý một instance, chưa có claim/lease lock cho nhiều backend nodes.
- Không có công thức/giá vốn và số dư thanh toán một phần.
