namespace MocCafe.Api.Domain;

// Small, deterministic invariants used by endpoints and unit tests.
public static class CafeRules
{
    public static bool CanReady(int quantity, int alreadyReady, int increment) => quantity > 0 && increment > 0 && alreadyReady >= 0 && alreadyReady + increment <= quantity;
    public static bool CanServe(int alreadyReady, int alreadyServed, int increment) => increment > 0 && alreadyServed >= 0 && alreadyServed + increment <= alreadyReady;
    public static decimal ChangeDue(decimal total, decimal tendered)
    {
        if (total < 0 || tendered < total) throw new ArgumentOutOfRangeException(nameof(tendered), "Tiền khách đưa không đủ");
        return tendered - total;
    }
    public static bool CanCloseVisit(IEnumerable<CafeOrder> orders) => orders.All(x => x.AcceptanceStatus != "Pending" && (x.AcceptanceStatus != "Accepted" || (x.FulfillmentStatus == "Served" && x.PaymentStatus == "Paid")));
}
