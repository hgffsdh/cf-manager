using System;

namespace MocCafe.Api.Domain;

// All inventory receipts are preserved in InventoryMovements (including purchase cost snapshots).
// Staff shifts and work events are historical records; do not cascade-delete them when accounts change.
public class StaffShift
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid BranchId { get; set; }
    public string Name { get; set; } = "";
    public DateTime StartAt { get; set; }
    public DateTime EndAt { get; set; }
    public string Note { get; set; } = "";
    public Guid CreatedByUserId { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public List<StaffShiftAssignment> Assignments { get; set; } = new();
}

public class StaffShiftAssignment
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid ShiftId { get; set; }
    public StaffShift Shift { get; set; } = null!;
    public Guid UserId { get; set; }
    public string Duty { get; set; } = "";
    public Guid? StationId { get; set; }
    public Guid AssignedByUserId { get; set; }
    public DateTime AssignedAt { get; set; } = DateTime.UtcNow;
}

public class PreparationWorkEvent
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid PreparationTaskId { get; set; }
    public PreparationTask PreparationTask { get; set; } = null!;
    public Guid ActorId { get; set; }
    public string Action { get; set; } = ""; // Started or Ready
    public int Quantity { get; set; } // Ready quantity; 0 for Started
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
