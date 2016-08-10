const toggleSpeed=200
function toggleList(){
  $("#userList").slideToggle(toggleSpeed);
}

$(window).on('load',function(){
    $('.pin-wall').masonry({
        columnWidth: '.pin',
        itemSelector: '.pin'
    });
})