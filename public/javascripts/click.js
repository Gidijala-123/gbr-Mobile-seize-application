$(document).ready(function()
{
    function syncSidebarTextVisibility() {
        var collapsed = $('#container').hasClass('sidebar-close');
        $('#sidebar .sidebar-menu li a .nav-text').css({
            'display': collapsed ? 'none' : 'inline-block',
            'visibility': collapsed ? 'hidden' : 'visible',
            'opacity': collapsed ? 0 : 1,
            'width': collapsed ? 0 : 'auto',
            'overflow': 'hidden',
            'color': '#e2e8f0'
        });
    }

    syncSidebarTextVisibility();
    $(window).on('resize', syncSidebarTextVisibility);
    $(document).on('click', '.sidebar-toggle-box', syncSidebarTextVisibility);

    // Force table tab headings to be visible
    $('.tab-pane.align > p.anim-typewriter, #totallist > p.anim-typewriter, #officelist > p.anim-typewriter, #returnedlist > p.anim-typewriter').css({
        'display': 'block',
        'visibility': 'visible',
        'opacity': '1',
        'color': '#1e293b',
        'background': 'transparent',
        'font-size': '20px',
        'font-weight': '800',
        'margin-bottom': '20px'
    });

// for status > transfer button
    $('.bbb').click(function()
    {
         var recordId=$(this).data('recordId');
            if (!recordId) return;
            $.post('/change',{"_id":recordId},function(data)
      {
        if (window.GBR && GBR.toast) {
          GBR.toast.success("✅ Mobile returned — status changed to Returned.");
        } else {
          alert("Mobile returned & Status changed successfully..!");
        }
        location.reload('/home');
      }).fail(function() {
        if (window.GBR && GBR.toast) GBR.toast.error("Failed to update status. Please try again.");
      });
    });
  

// to change the status color after clicking on transfer button
    $("td").each(function(){
        if($(this).text().trim()==="Returned"){
            $(this).css("backgroundColor","#FD052E");
            $(this).css("color","white");
            $(this).addClass("status-returned");
        }
        if($(this).text().trim()==="At_office"){
            $(this).css("backgroundColor","#85FD2D");
            $(this).css("color","black");
            $(this).addClass("status-at-office");
        }
    });
    
    function renderSmartRowEditor($row, record) {
        var fields = [
            { key: 'rno', label: 'Roll number' },
            { key: 'sname', label: 'Student name' },
            { key: 'clg', label: 'College' },
            { key: 'brch', label: 'Branch' },
            { key: 'mmodel', label: 'Mobile model' },
            { key: 'imei', label: 'IMEI' },
            { key: 'mclr', label: 'Mobile color' },
            { key: 'ename', label: 'Employee name' },
            { key: 'Date', label: 'Date' }
        ];

        $row.data('inline-record', $.extend({}, record));
        $row.data('inline-original-id', String(record._id || ''));
        $row.empty().addClass('is-inline-editing');

        fields.forEach(function (field) {
            var value = record[field.key];
            var $input = $('<input>', {
                type: 'text',
                class: 'inline-edit-field',
                'data-inline-field': field.key,
                'aria-label': field.label
            }).val(value == null ? '' : String(value));
            $row.append($('<td>').append($input));
        });

        var $actions = $('<td>').addClass('inline-edit-actions');
        $actions.append($('<button>', {
            type: 'button',
            class: 'inline-edit-action inline-edit-save'
        }).text('Save'));
        $actions.append($('<button>', {
            type: 'button',
            class: 'inline-edit-action inline-edit-cancel'
        }).text('Cancel'));
        $row.append($actions);
    }

    function updateSmartSearchSource(record, originalId) {
        var sourceColumns = {
            Date: 0,
            rno: 3,
            sname: 4,
            clg: 5,
            brch: 6,
            mmodel: 12,
            imei: 13,
            mclr: 14,
            ename: 16
        };
        var $sourceRow = $('#example5 tbody tr').filter(function () {
            return $(this).children('td').eq(2).text().trim() === originalId;
        }).first();

        Object.keys(sourceColumns).forEach(function (field) {
            $sourceRow.children('td').eq(sourceColumns[field]).text(record[field] || '');
        });
    }

    function openSmartRowEditor($row, recordId) {
        $.post('/edit', { _id: recordId }, function (records) {
            if (!records || !records.length) {
                if (window.GBR && GBR.toast) GBR.toast.error('Record not found.');
                return;
            }
            renderSmartRowEditor($row, records[0]);
        }).fail(function () {
            if (window.GBR && GBR.toast) GBR.toast.error('Failed to load record for editing.');
        });
    }

    $(document).on('click', '#smart-results-table .inline-edit-cancel', function () {
        $('#smartSearch').trigger('input');
    });

    $(document).on('click', '#smart-results-table .inline-edit-save', function () {
        var $row = $(this).closest('tr');
        var originalId = $row.data('inline-original-id');
        var record = $.extend({}, $row.data('inline-record'));
        var $saveButton = $(this).prop('disabled', true);

        $row.find('[data-inline-field]').each(function () {
            record[$(this).data('inline-field')] = $(this).val();
        });
        record._id = originalId;

        $.post('/update', record).done(function () {
            updateSmartSearchSource(record, originalId);
            $('#smartSearch').trigger('input');
            if (window.GBR && GBR.toast) GBR.toast.success('Record updated.');
        }).fail(function () {
            $saveButton.prop('disabled', false);
            if (window.GBR && GBR.toast) GBR.toast.error('Failed to update record. Please try again.');
        });
    });

// Edit controls exist only in the live search results table.
    $(document).on('click', '#smart-results-table .edit', function (event) {
        event.preventDefault();
        var $smartRow = $(this).closest('tr');
        if (!$smartRow.hasClass('is-inline-editing')) {
            openSmartRowEditor($smartRow, $(this).data('recordId'));
        }
    });

    // to display anchor tag data of help button
    $('#navbar a').click(function(e)
    {
        $('.dontshow').show();
        $('.conta > div').hide();
        $(this.hash).show();
        e.preventDefault(); //to prevent scrolling
    });

    // for contact tab
    $('#cntm11').click(function(e)
    {
        $('.main').hide();
        $('#m11').show();
    });

    $('#cntm12').click(function(e)
    {
        $('.main').hide();
        $('#m12').show();
    });
    $('#cntm21').click(function(e)
    {
        $('.main').hide();
        $('#m21').show();
    });
    $('#cntm22').click(function(e)
    {
        $('.main').hide();
        $('#m22').show();
    });
    $('#cntm31').click(function(e)
    {
        $('.main').hide();
        $('#m31').show();
    });
    $('#cntm32').click(function(e)
    {
        $('.main').hide();
        $('#m32').show();
    });
    $('#cntb11').click(function(e)
    {
        $('.main').hide();
        $('#b11').show();
    });
    $('#cntb12').click(function(e)
    {
        $('.main').hide();
        $('#b12').show();
    });
    $('#cntb21').click(function(e)
    {
        $('.main').hide();
        $('#b21').show();
    });
    $('#cntb22').click(function(e)
    {
        $('.main').hide();
        $('#b22').show();
    });
    $('#cntb31').click(function(e)
    {
        $('.main').hide();
        $('#b31').show();
    });
    $('#cntb32').click(function(e)
    {
        $('.main').hide();
        $('#b32').show();
    });
    $('#cnta11').click(function(e)
    {
        $('.main').hide();
        $('#a11').show();
    });
    $('#cnta21').click(function(e)
    {
        $('.main').hide();
        $('#a21').show();
    });
    $('#cnta31').click(function(e)
    {
        $('.main').hide();
        $('#a31').show();
    });

    $('#xyz').click(function(e)
    {
        $('.main').show();
    });
});


     
