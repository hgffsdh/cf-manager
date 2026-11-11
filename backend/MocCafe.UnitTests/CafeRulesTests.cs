using MocCafe.Api.Domain;
using Xunit;
namespace MocCafe.UnitTests;
public class CafeRulesTests
{
    [Theory]
    [InlineData(3,0,1,true)]
    [InlineData(3,2,1,true)]
    [InlineData(3,3,1,false)]
    [InlineData(3,2,2,false)]
    public void CanReady_PreventsOverProduction(int ordered,int ready,int increment,bool expected)
        => Assert.Equal(expected,CafeRules.CanReady(ordered,ready,increment));

    [Theory]
    [InlineData(2,1,1,true)]
    [InlineData(2,2,1,false)]
    [InlineData(0,0,1,false)]
    public void CanServe_NeverExceedsReady(int ready,int served,int increment,bool expected)
        => Assert.Equal(expected,CafeRules.CanServe(ready,served,increment));

    [Fact]
    public void CashChange_RequiresEnoughTender()
    {
        Assert.Equal(15000m,CafeRules.ChangeDue(35000m,50000m));
        Assert.Throws<ArgumentOutOfRangeException>(()=>CafeRules.ChangeDue(35000m,20000m));
    }

    [Fact]
    public void VisitCannotCloseWithUnpaidServedOrder()
    {
        var order = new CafeOrder { AcceptanceStatus="Accepted", FulfillmentStatus="Served", PaymentStatus="Unpaid" };
        Assert.False(CafeRules.CanCloseVisit(new[]{order}));
        order.PaymentStatus="Paid";
        Assert.True(CafeRules.CanCloseVisit(new[]{order}));
    }
}
