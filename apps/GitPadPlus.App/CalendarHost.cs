// SPDX-License-Identifier: AGPL-3.0-only
using Microsoft.Maui.Handlers;
#if WINDOWS
using PlatformCalendar = Microsoft.UI.Xaml.Controls.CalendarView;
#elif ANDROID
using PlatformCalendar = Android.Widget.CalendarView;
#endif

namespace GitPadPlus.App;
public sealed class CalendarHost : View
{
    public event Action<DateOnly>? DateSelected;
    public void Select(DateOnly date) => DateSelected?.Invoke(date);
}
public sealed class CalendarHandler : ViewHandler<CalendarHost, PlatformCalendar>
{
    public CalendarHandler() : base(new PropertyMapper<CalendarHost, CalendarHandler>(ViewMapper)) { }
    protected override PlatformCalendar CreatePlatformView()
    {
#if WINDOWS
        var calendar = new PlatformCalendar { SelectionMode = Microsoft.UI.Xaml.Controls.CalendarViewSelectionMode.Single };
        calendar.SelectedDatesChanged += (_, args) => { if (args.AddedDates.Count > 0) VirtualView.Select(DateOnly.FromDateTime(args.AddedDates[0].Date)); };
#elif ANDROID
        var calendar = new PlatformCalendar(Context);
        calendar.DateChange += (_, args) => VirtualView.Select(new DateOnly(args.Year, args.Month + 1, args.DayOfMonth));
#endif
        return calendar;
    }
}
